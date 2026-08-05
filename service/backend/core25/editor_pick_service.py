"""Core 2.5 Editor Pick Service.

매일 KST 05:30 EventBridge cron 으로 발화되는 Editor Pick Lambda 의 비즈니스 로직.

Pipeline (per fire):
1. 그날 KST 기준 article_selections 에서 transformed_at IS NOT NULL 인 후보 풀
   상위 20 건 추출 (각 row 는 article × MBTI 의 1 변환 결과 + 원본 메타).
2. 4 페르소나 카드 + orchestrator 프롬프트 + 후보 풀 → Opus 4.6 1 invoke.
3. 응답 JSON → 4 letter 객체 (NT/NF/ST/SF 각 1편).
4. UNIQUE(letter_date, editor_id) 로 idempotent insert. 같은 날 재실행해도 안전.

설계 노트:
- 후보 풀은 article-level (news_id) 단위. 같은 article 의 4 MBTI 버전을 모두
  candidate 안의 transformed_versions 에 넣어서 Opus 가 각 에디터 시각의 변환
  결과까지 보고 letter 톤으로 재작성하도록 함.
- mode A/C 판단은 orchestrator (Opus) 가 함. 핸들러는 검증만.
- 비용 (Haiku 4.5 베타): 1 invoke/일 ≈ 입력 15K tok × $1/M + 출력 6K tok × $5/M
  = $0.045/일 = 월 ~$1.4. Opus 4.6 운영 단계 전환 시 월 ~$20.
  그래도 cache_control: ephemeral 박음 (.clauderules #7 일관성).
"""
from __future__ import annotations

import json
import logging
import os
import time
from datetime import date as date_type
from pathlib import Path
from typing import Any, Dict, List, Optional, Protocol

import boto3
from botocore.config import Config


logger = logging.getLogger(__name__)


# Bedrock 모델 — v1 format (4 letter × 4 기사 큐레이션) 복잡한 JSON 출력 정확도 위해
# Sonnet 4.5 사용 (베타 단계 비용·정확도 균형).
#   Sonnet 4.5: input ~$3/M · output ~$15/M → 일 ~$0.1 / 월 ~$3
#   Haiku 4.5: input $1/M · output $5/M (JSON 누락 자주 발생, 참고용)
#   Opus 4.6: input $15/M · output $75/M (정식 전환 시 고려)
_SONNET_MODEL_ID = "us.anthropic.claude-sonnet-4-5-20250929-v1:0"
_HAIKU_MODEL_ID = "us.anthropic.claude-haiku-4-5-20251001-v1:0"  # 참고용
# JSON 검증 실패 시 재시도 횟수.
_MAX_INVOKE_RETRIES = 3

# 프롬프트 디렉토리 — Lambda 패키지 안에서도 동일 경로 (deploy-v2.sh 가 v2 dir 통째로 zip).
_PROMPT_DIR = Path(__file__).resolve().parents[1] / "prompts" / "editor_letter"

_BEDROCK_CONFIG = Config(
    region_name="us-east-1",
    retries={"max_attempts": 3, "mode": "adaptive"},
    read_timeout=180,
    connect_timeout=10,
)

# 후보 풀 크기 — letter 1편 = 한 주제 4 기사 클러스터. 4 letter = 16 기사 필요.
# 페르소나마다 주제 흐름 찾으려면 풀에 충분한 다양성 필요.
DEFAULT_CANDIDATE_POOL_SIZE = 24

# 출력 max_tokens. letter 1편 = 4 기사 × (요약 3 + qa 3 + insight or insight_lines).
# 한국어 + JSON overhead 고려 시 letter 당 ~4000 token, 4 letter ~16000.
# 여유 두고 20000.
DEFAULT_MAX_OUTPUT_TOKENS = 20000

# Opus 후보 풀에 본문 발췌를 박을 때 자르는 길이.
SNIPPET_CHARS = int(os.getenv("SNIPPET_CHARS", "400"))

# orchestrator 가 반환해야 할 letter-level 필드 (v1 format).
_REQUIRED_LETTER_FIELDS = (
    "editor_id", "mbti_group",
    "thumbnail_title", "thumbnail_subtitle",
    "articles",
    "archetype", "theme",
)
# 1~3번 기사가 가져야 할 필드.
_REQUIRED_ARTICLE_FULL_FIELDS = (
    "article_id", "original_title", "thumbnail_title",
    "summary", "qa", "insight",
)
# 4~6번 기사가 가져야 할 필드 (qa 없음, insight_lines 만).
_REQUIRED_ARTICLE_SHORT_FIELDS = (
    "article_id", "original_title", "thumbnail_title",
    "summary", "insight_lines",
)

_EXPECTED_GROUPS = {"NT", "NF", "ST", "SF"}
_EDITOR_ID_BY_GROUP = {
    "NT": "NT-min",
    "NF": "NF-ha",
    "ST": "ST-jun",
    "SF": "SF-soy",
}


class EditorPickError(Exception):
    """Editor Pick 단계 실패 (parse/validation 등)."""


class CandidateSource(Protocol):
    """후보 풀 조회 인터페이스. PgVectorV2Client 가 구현하면 됨."""

    def get_editor_pick_candidates(
        self,
        letter_date: str,
        limit: int = DEFAULT_CANDIDATE_POOL_SIZE,
    ) -> List[Dict[str, Any]]:
        """그날 transformed 된 articles 의 후보 풀 반환.

        각 row 형식:
            {
              "article_id": str,
              "title": str,
              "subtitle": Optional[str],
              "category": str,
              "themes": List[str],
              "press": str,
              "byline": str,
              "snippet": str,                                  # 원본 본문 발췌
              "transformed_versions": Dict[str, str],          # {NT/NF/ST/SF: body 텍스트}
              "transformed_at": datetime,
            }
        """
        ...


class LetterSink(Protocol):
    """daily_letters insert 인터페이스."""

    def insert_daily_letter(self, letter: Dict[str, Any]) -> None:
        ...


# ── Prompt loading ────────────────────────────────────────────────────────────


def _load_prompt(name: str) -> str:
    path = _PROMPT_DIR / f"{name}.md"
    with open(path, "r", encoding="utf-8") as f:
        return f.read()


def load_persona_cards() -> Dict[str, str]:
    return {
        "NT": _load_prompt("NT"),
        "NF": _load_prompt("NF"),
        "ST": _load_prompt("ST"),
        "SF": _load_prompt("SF"),
    }


def load_orchestrator_system() -> str:
    return _load_prompt("orchestrator")


# ── Candidate shaping ─────────────────────────────────────────────────────────


def shape_candidate_for_orchestrator(row: Dict[str, Any]) -> Dict[str, Any]:
    """pg row → orchestrator 입력 candidate dict (Opus 토큰 절감용 트리밍)."""
    snippet = (row.get("snippet") or "").strip()
    if len(snippet) > SNIPPET_CHARS:
        snippet = snippet[:SNIPPET_CHARS] + "…"

    versions = row.get("transformed_versions") or {}
    # 각 MBTI 본문도 너무 길면 자름 (Opus 입력 토큰 절감).
    trimmed_versions = {
        g: (versions.get(g) or "")[: SNIPPET_CHARS * 2]
        for g in ("NT", "NF", "ST", "SF")
        if versions.get(g)
    }

    return {
        "article_id": row["article_id"],
        "title": row.get("title") or "",
        "subtitle": row.get("subtitle") or "",
        "category": row.get("category") or "",
        "themes": row.get("themes") or [],
        "press": row.get("press") or "서울경제",
        "byline": row.get("byline") or "",
        "snippet": snippet,
        "transformed_versions": trimmed_versions,
    }


# ── Opus invoke ───────────────────────────────────────────────────────────────


def _build_messages(
    candidates: List[Dict[str, Any]],
    personas: Dict[str, str],
    letter_date: str,
    narrative_hints: Optional[Dict[str, Any]] = None,
) -> List[Dict[str, Any]]:
    payload = {
        "letter_date": letter_date,
        "personas": personas,
        "candidates": candidates,
    }
    if narrative_hints and narrative_hints.get("frames"):
        payload["narrative_hints"] = narrative_hints["frames"]
    return [
        {
            "role": "user",
            "content": [
                {"type": "text", "text": json.dumps(payload, ensure_ascii=False)},
            ],
        }
    ]


def invoke_letter_orchestrator(
    candidates: List[Dict[str, Any]],
    letter_date: str,
    *,
    bedrock_client: Optional[Any] = None,
    model_id: str = _SONNET_MODEL_ID,
    max_output_tokens: int = DEFAULT_MAX_OUTPUT_TOKENS,
    max_retries: int = _MAX_INVOKE_RETRIES,
    narrative_hints: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """Opus 4.6 1 invoke 로 4 에디터 letter 생성.

    Returns:
        {
          "mode": "A" | "C",
          "letters": [letter, letter, letter, letter],  # NT/NF/ST/SF 각 1
          "_usage": {"input_tokens": int, "output_tokens": int, ...},
          "_elapsed_s": float,
        }

    Raises:
        EditorPickError: JSON parse 실패 또는 letters 개수 / mbti_group 검증 실패.
    """
    if bedrock_client is None:
        # VPC Lambda 는 인터넷 직접 접근 X — BEDROCK_RUNTIME_ENDPOINT_URL 환경변수
        # (예: https://vpce-xxx.bedrock-runtime.us-east-1.vpce.amazonaws.com) 통해 호출.
        # 로컬에서 호출 시 환경변수 없으면 default public endpoint 사용.
        endpoint_url = os.getenv("BEDROCK_RUNTIME_ENDPOINT_URL")
        if endpoint_url:
            bedrock_client = boto3.client(
                "bedrock-runtime",
                config=_BEDROCK_CONFIG,
                endpoint_url=endpoint_url,
            )
        else:
            bedrock_client = boto3.client("bedrock-runtime", config=_BEDROCK_CONFIG)

    personas = load_persona_cards()
    system_prompt = load_orchestrator_system()

    body = {
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": max_output_tokens,
        "system": [
            {
                "type": "text",
                "text": system_prompt,
                "cache_control": {"type": "ephemeral"},
            }
        ],
        "messages": _build_messages(candidates, personas, letter_date, narrative_hints=narrative_hints),
    }

    # 재시도 루프 — JSON parse / schema 검증 실패 시 같은 모델로 다시 호출.
    # 복잡한 JSON 출력에서 LLM 이 미세 문법 실수 (누락된 `}`, 콤마 등) 할 수 있음.
    last_error: Optional[Exception] = None
    parsed: Optional[Dict[str, Any]] = None
    usage: Dict[str, Any] = {}
    elapsed_s: float = 0.0
    text: str = ""

    for attempt in range(1, max_retries + 1):
        t0 = time.monotonic()
        response = bedrock_client.invoke_model(
            modelId=model_id,
            body=json.dumps(body),
            contentType="application/json",
            accept="application/json",
        )
        elapsed_s = round(time.monotonic() - t0, 2)
        raw = response["body"].read()
        payload = json.loads(raw)
        text = "".join(b.get("text", "") for b in payload.get("content", []))
        usage = payload.get("usage", {})

        try:
            parsed = parse_orchestrator_output(text)
            break
        except EditorPickError as exc:
            last_error = exc
            logger.warning(json.dumps({
                "event": "editor_pick_invoke_retry",
                "attempt": attempt,
                "max_retries": max_retries,
                "error": str(exc)[:300],
                "elapsed_s": elapsed_s,
            }))
            if attempt == max_retries:
                raise

    assert parsed is not None  # mypy 만족 — break 했으면 set, 안 했으면 raise.
    parsed["_usage"] = usage
    parsed["_elapsed_s"] = elapsed_s

    logger.info(json.dumps({
        "event": "editor_pick_invoke_complete",
        "letter_date": letter_date,
        "candidates_count": len(candidates),
        "elapsed_s": elapsed_s,
        "input_tokens": usage.get("input_tokens", 0),
        "output_tokens": usage.get("output_tokens", 0),
        "cache_read_input_tokens": usage.get("cache_read_input_tokens", 0),
        "cache_creation_input_tokens": usage.get("cache_creation_input_tokens", 0),
        "letters_count": len(parsed.get("letters", [])),
        "mode": parsed.get("mode"),
    }))
    return parsed


# ── Parse + validate ──────────────────────────────────────────────────────────


def parse_orchestrator_output(text: str) -> Dict[str, Any]:
    """Orchestrator 응답 텍스트 → 검증된 JSON 객체.

    - 옵셔널 코드펜스 (` ```json ` / ` ``` `) 제거.
    - JSON 파싱. 미세 문법 실수 (누락된 `}`, 콤마 등) 는 json-repair 로 자동 보정.
    - letters 길이 == 4, 4 mbti_group 모두 다름, 필수 필드 모두 있음.
    """
    cleaned = text.strip()
    if cleaned.startswith("```"):
        lines = cleaned.splitlines()
        cleaned = "\n".join(lines[1:])
        if cleaned.rstrip().endswith("```"):
            cleaned = cleaned.rstrip()[:-3].rstrip()

    try:
        obj = json.loads(cleaned)
    except json.JSONDecodeError as exc:
        # LLM 의 미세 문법 실수 (누락된 `}`, 콤마, escape 누락) 자동 보정 시도.
        try:
            from json_repair import repair_json  # type: ignore
            repaired = repair_json(cleaned, return_objects=True)
            if isinstance(repaired, dict) and repaired:
                logger.warning(json.dumps({
                    "event": "editor_pick_json_repaired",
                    "original_error": str(exc)[:200],
                }))
                obj = repaired
            else:
                raise EditorPickError(
                    f"orchestrator output is not valid JSON and repair failed: {exc}; "
                    f"first 300 chars: {cleaned[:300]!r}"
                ) from exc
        except ImportError:
            raise EditorPickError(
                f"orchestrator output is not valid JSON (json-repair unavailable): {exc}; "
                f"first 300 chars: {cleaned[:300]!r}"
            ) from exc
        except Exception as repair_exc:
            raise EditorPickError(
                f"orchestrator output is not valid JSON and repair failed ({repair_exc}): "
                f"original={exc}; first 300 chars: {cleaned[:300]!r}"
            ) from exc

    if not isinstance(obj, dict):
        raise EditorPickError(f"orchestrator output is not an object: {type(obj).__name__}")

    mode = obj.get("mode")
    if mode != "A":  # v1 format 은 항상 A (1편당 6 기사 묶음)
        raise EditorPickError(f"invalid mode (v1 format requires 'A'): {mode!r}")

    letters = obj.get("letters")
    if not isinstance(letters, list) or len(letters) != 4:
        raise EditorPickError(
            f"expected 4 letters, got {len(letters) if isinstance(letters, list) else type(letters).__name__}"
        )

    got_groups: set = set()
    for i, ltr in enumerate(letters):
        if not isinstance(ltr, dict):
            raise EditorPickError(f"letters[{i}] is not an object")
        for field in _REQUIRED_LETTER_FIELDS:
            if field not in ltr:
                raise EditorPickError(f"letters[{i}] missing field {field!r}")
        grp = ltr.get("mbti_group")
        if grp not in _EXPECTED_GROUPS:
            raise EditorPickError(f"letters[{i}].mbti_group invalid: {grp!r}")
        got_groups.add(grp)
        # editor_id 정합성 — orchestrator 가 자유 텍스트로 잘못 쓸 수 있어 안전망.
        expected_eid = _EDITOR_ID_BY_GROUP[grp]
        if ltr.get("editor_id") != expected_eid:
            logger.warning(
                f"letters[{i}].editor_id={ltr.get('editor_id')!r} != expected "
                f"{expected_eid!r} — overriding"
            )
            ltr["editor_id"] = expected_eid

        # articles 검증 — 정확히 4, 1-2번은 qa+insight, 3-4번은 insight_lines.
        articles = ltr.get("articles")
        if not isinstance(articles, list) or len(articles) != 4:
            raise EditorPickError(
                f"letters[{i}].articles must be length 4, got {len(articles) if isinstance(articles, list) else type(articles).__name__}"
            )
        for j, art in enumerate(articles):
            if not isinstance(art, dict):
                raise EditorPickError(f"letters[{i}].articles[{j}] is not an object")
            required = _REQUIRED_ARTICLE_FULL_FIELDS if j < 2 else _REQUIRED_ARTICLE_SHORT_FIELDS
            for field in required:
                if field not in art:
                    raise EditorPickError(
                        f"letters[{i}].articles[{j}] missing field {field!r} "
                        f"({'1-2번' if j < 2 else '3-4번'} 그룹)"
                    )
            # summary 는 정확히 3개 (1-4번 전부).
            if not isinstance(art["summary"], list) or len(art["summary"]) != 3:
                raise EditorPickError(
                    f"letters[{i}].articles[{j}].summary must be length 3"
                )
            # 1-2번: qa 길이 3.
            if j < 2:
                qa = art["qa"]
                if not isinstance(qa, list) or len(qa) != 3:
                    raise EditorPickError(
                        f"letters[{i}].articles[{j}].qa must be length 3"
                    )
            # 3-4번: insight_lines 길이 3.
            else:
                lines = art["insight_lines"]
                if not isinstance(lines, list) or len(lines) != 3:
                    raise EditorPickError(
                        f"letters[{i}].articles[{j}].insight_lines must be length 3"
                    )

        # 자기 letter 안 4 article_id 중복 없음.
        ids_in_letter = [a["article_id"] for a in articles]
        if len(set(ids_in_letter)) != 4:
            raise EditorPickError(
                f"letters[{i}].articles contains duplicate article_ids: {ids_in_letter}"
            )

    if got_groups != _EXPECTED_GROUPS:
        raise EditorPickError(
            f"expected mbti_groups {_EXPECTED_GROUPS}, got {got_groups}"
        )

    return obj


# ── End-to-end pipeline ───────────────────────────────────────────────────────


def run_editor_pick(
    source: CandidateSource,
    sink: LetterSink,
    letter_date: Optional[str] = None,
    *,
    bedrock_client: Optional[Any] = None,
    candidate_pool_size: int = DEFAULT_CANDIDATE_POOL_SIZE,
    s3_writer: Optional[Any] = None,  # 옵셔널 — S3 body upload (None 이면 inline 만)
    require_paper_date: Optional[str] = None,  # YYYYMMDD — 이 지면일이 아니면 생성 보류
    prompt_version: Optional[str] = None,  # "v1" | "v3" — None 이면 env → "v1"
    article_body_source: Optional[Any] = None,  # v3 전문 로드용 S3ArticleV2Client
) -> Dict[str, Any]:
    """End-to-end. CandidateSource → Opus → LetterSink.

    ``require_paper_date`` 는 재시도 스케줄(3회 발화)의 앞 시도에서 쓴다:
    후보 풀이 직전 지면일로 fallback 된 상태라면 (= 오늘 지면이 아직 수집 전)
    Bedrock 을 태우지 않고 ``status="waiting_fresh_paper"`` 로 빠진다.
    마지막 시도는 None 으로 불러 fallback 을 허용한다.

    Returns:
        {
          "letter_date": str,
          "letters_inserted": int,
          "mode": "A" | "C",
          "letters": [...],  # 저장된 letter 객체들
        }
    """
    if letter_date is None:
        # KST 기준 오늘.
        from datetime import datetime, timezone, timedelta
        kst = timezone(timedelta(hours=9))
        letter_date = datetime.now(tz=kst).date().isoformat()

    raw_candidates = source.get_editor_pick_candidates(
        letter_date, limit=candidate_pool_size
    )
    if not raw_candidates:
        logger.info(json.dumps({
            "event": "editor_pick_empty_pool",
            "letter_date": letter_date,
        }))
        return {
            "letter_date": letter_date,
            "letters_inserted": 0,
            "mode": None,
            "letters": [],
        }

    if require_paper_date:
        pool_paper_dates = {
            r.get("paper_date") for r in raw_candidates if r.get("paper_date")
        }
        if pool_paper_dates and require_paper_date not in pool_paper_dates:
            logger.info(json.dumps({
                "event": "editor_pick_waiting_fresh_paper",
                "letter_date": letter_date,
                "required_paper_date": require_paper_date,
                "pool_paper_dates": sorted(pool_paper_dates),
            }))
            return {
                "letter_date": letter_date,
                "letters_inserted": 0,
                "mode": None,
                "letters": [],
                "status": "waiting_fresh_paper",
            }

    resolved_version = (
        prompt_version or os.getenv("EDITOR_PICK_PROMPT_VERSION", "v1")
    ).lower()
    if resolved_version == "v3":
        return _run_editor_pick_v3(
            raw_candidates=raw_candidates,
            sink=sink,
            letter_date=letter_date,
            bedrock_client=bedrock_client,
            article_body_source=article_body_source,
        )

    shaped = [shape_candidate_for_orchestrator(r) for r in raw_candidates]

    # Narrative Planner — feature flag 활성 시 Haiku로 풍경 도출 (비활성 시 None, 기존 흐름 유지)
    from core25.narrative_planner import plan_narratives
    narrative_frames = plan_narratives(shaped, letter_date, bedrock_client=bedrock_client)

    parsed = invoke_letter_orchestrator(
        shaped, letter_date, bedrock_client=bedrock_client, narrative_hints=narrative_frames
    )

    mode = parsed["mode"]
    letters = parsed["letters"]
    usage = parsed.get("_usage", {})

    # Letter Validator — rule-based 사후 검증 (기존 흐름 차단 안 함, 로깅만)
    from core25.letter_validator import validate_letters
    validation = validate_letters(letters, shaped)
    if not validation.passed:
        logger.warning(json.dumps({
            "event": "editor_pick_validation_failed",
            "letter_date": letter_date,
            "errors": validation.errors[:5],
        }))

    inserted = 0
    for ltr in letters:
        # v1 format: letter = 6 기사 묶음. primary=articles[0], secondary=articles[1:].
        articles = ltr["articles"]
        primary_id = articles[0]["article_id"]
        secondary_ids = [a["article_id"] for a in articles[1:]]
        record = {
            "letter_date": letter_date,
            "editor_id": ltr["editor_id"],
            "mbti_group": ltr["mbti_group"],
            "article_id": primary_id,
            "secondary_article_ids": secondary_ids,
            "mode": mode,
            "archetype": ltr.get("archetype"),
            "theme": ltr.get("theme"),
            # column-level: 통합 썸네일을 호환적으로 매핑.
            "headline": ltr["thumbnail_title"],
            "subtitle": ltr.get("thumbnail_subtitle"),
            "closing_line": None,  # v1 format 은 letter-level closing 없음 (article-level insight 로 대체).
            "body_s3_uri": None,
            # body_inline JSONB — v1 format 전체 구조 그대로 (articles[] 포함).
            "body_inline": {
                "thumbnail_title": ltr["thumbnail_title"],
                "thumbnail_subtitle": ltr.get("thumbnail_subtitle"),
                "articles": articles,
            },
            "keywords": [],  # v1 format 은 키워드 사전 분리 X — 답변 안에 녹임.
            "bedrock_usage": usage,
        }

        # 옵셔널 — S3 body upload (Phase 2 에서 활성화).
        if s3_writer is not None:
            try:
                uri = s3_writer.put_letter_body(
                    letter_date=letter_date,
                    editor_id=ltr["editor_id"],
                    body_payload=record["body_inline"],
                )
                record["body_s3_uri"] = uri
            except Exception as exc:
                logger.warning(
                    f"s3 put_letter_body failed for {ltr['editor_id']}: {exc} "
                    f"— falling back to body_inline"
                )

        try:
            sink.insert_daily_letter(record)
            inserted += 1
        except Exception as exc:
            logger.error(
                f"insert_daily_letter failed for {letter_date} {ltr['editor_id']}: {exc}",
                exc_info=True,
            )

    logger.info(json.dumps({
        "event": "editor_pick_run_complete",
        "letter_date": letter_date,
        "candidates_count": len(shaped),
        "letters_inserted": inserted,
        "mode": mode,
        "input_tokens": usage.get("input_tokens", 0),
        "output_tokens": usage.get("output_tokens", 0),
    }))

    return {
        "letter_date": letter_date,
        "letters_inserted": inserted,
        "mode": mode,
        "letters": letters,
    }


def _make_bedrock_client() -> Any:
    """VPC Lambda 는 BEDROCK_RUNTIME_ENDPOINT_URL 경유, 로컬은 public endpoint."""
    endpoint_url = os.getenv("BEDROCK_RUNTIME_ENDPOINT_URL")
    if endpoint_url:
        return boto3.client(
            "bedrock-runtime", config=_BEDROCK_CONFIG, endpoint_url=endpoint_url
        )
    return boto3.client("bedrock-runtime", config=_BEDROCK_CONFIG)


def _run_editor_pick_v3(
    *,
    raw_candidates: List[Dict[str, Any]],
    sink: LetterSink,
    letter_date: str,
    bedrock_client: Optional[Any],
    article_body_source: Optional[Any],
) -> Dict[str, Any]:
    """v3 경로 — 페르소나별 4 invoke, 에세이형 레터 (2026-08-03 채택).

    body_inline 은 today-letters API 의 신형식({body[], key_points[]})으로
    저장돼 핸들러 평탄화 없이 그대로 프론트에 전달된다.
    """
    from core25.editor_pick_v3 import enrich_full_bodies, generate_v3_letters

    if bedrock_client is None:
        bedrock_client = _make_bedrock_client()

    # 후보 정렬 규약: get_editor_pick_candidates 가 지면 TOP 을 첫 행으로 준다.
    candidates = list(raw_candidates)
    if candidates:
        candidates[0] = {**candidates[0], "is_top": True}

    if article_body_source is not None:
        enrich_full_bodies(candidates, article_body_source)

    article_ids = [c["article_id"] for c in candidates]
    primary_id = article_ids[0] if article_ids else None
    secondary_ids = article_ids[1:]

    inserted_count = {"n": 0}

    def _insert_now(ltr: Dict[str, Any]) -> None:
        """1편 완성 즉시 upsert — 타임아웃 시에도 완성분은 보존."""
        record = {
            "letter_date": letter_date,
            "editor_id": ltr["editor_id"],
            "mbti_group": ltr["mbti_group"],
            "article_id": primary_id,
            "secondary_article_ids": secondary_ids,
            "mode": "A",
            "archetype": ltr.get("archetype"),
            "theme": ltr.get("theme"),
            "headline": ltr["headline"],
            "subtitle": ltr.get("subtitle"),
            "closing_line": ltr.get("closing_line"),
            "body_s3_uri": None,
            "body_inline": {
                "body": ltr["body"],
                "key_points": ltr.get("key_points") or [],
            },
            "keywords": ltr.get("keywords") or [],
            "bedrock_usage": None,  # 편별 즉시 저장이라 합산 usage 는 로그로만.
        }
        try:
            sink.insert_daily_letter(record)
            inserted_count["n"] += 1
        except Exception as exc:
            logger.error(
                f"insert_daily_letter(v3) failed for {letter_date} {ltr['editor_id']}: {exc}",
                exc_info=True,
            )

    # 비용 태깅: EDITOR_PICK_MODEL_ID 에 application inference profile ARN
    # (mbti-letter-sonnet-45, Workload=letter)을 넣으면 레터 생성비가 빌링에서
    # 분리 집계된다. 미설정 시 raw 모델 ID (미태깅).
    model_id = os.getenv("EDITOR_PICK_MODEL_ID", _SONNET_MODEL_ID)

    result = generate_v3_letters(
        candidates,
        letter_date,
        bedrock_client=bedrock_client,
        model_id=model_id,
        max_retries=_MAX_INVOKE_RETRIES,
        on_letter=_insert_now,
    )
    letters = result["letters"]
    usage = result["_usage"]
    inserted = inserted_count["n"]

    logger.info(json.dumps({
        "event": "editor_pick_run_complete",
        "prompt_version": "v3",
        "letter_date": letter_date,
        "candidates_count": len(candidates),
        "letters_inserted": inserted,
        "mode": "A",
        "input_tokens": usage.get("input_tokens", 0),
        "output_tokens": usage.get("output_tokens", 0),
    }))

    return {
        "letter_date": letter_date,
        "letters_inserted": inserted,
        "mode": "A" if inserted else None,
        "letters": letters,
        "prompt_version": "v3",
    }
