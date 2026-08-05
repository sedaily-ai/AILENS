"""Editor Pick v3 — 페르소나별 4 invoke 로 에세이형 레터 생성.

v1(orchestrator 1 invoke → 압축형 4편, ~1,000자)과 병행하는 신형 경로.
프롬프트는 ``prompts/editor_letter_v3/{nt,nf,st,sf}/`` — docs/prompt-mbti-v2
v3.0.0 세트를 백엔드로 이식한 것 (레터당 메인 본문 1,500자+, 에세이형).

경로 선택은 ``run_editor_pick(prompt_version=...)`` — 핸들러가
``EDITOR_PICK_PROMPT_VERSION`` env 로 결정한다 (v1 롤백용).

출력은 today-letters API 의 신형식(body_inline.body[])으로 바로 저장:
프론트 LetterDetailClient 의 라인 문법(■ 섹션 / [라벨] 콜아웃 / 문단)을
web_output_contract.md 가 강제한다. 2026-08-03 웹 비교(프리뷰 슬롯 7/1)로
사용자 채택 확정.
"""
from __future__ import annotations

import json
import logging
import os
import re
import time
from pathlib import Path
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

_V3_PROMPT_DIR = Path(__file__).resolve().parents[1] / "prompts" / "editor_letter_v3"

# (그룹, 프롬프트 하위 디렉토리, editor_id, 페르소나 이름)
V3_EDITORS = [
    ("NT", "nt", "NT-min", "민철"),
    ("NF", "nf", "NF-ha", "하은"),
    ("ST", "st", "ST-jun", "준서"),
    ("SF", "sf", "SF-soy", "소율"),
]

# 프롬프트 결합 순서 — instruction 이 나머지를 참조하는 v3 의존 구조 그대로.
_FILE_ORDER = [
    "instruction.txt",
    "core_knowledge_generation.txt",
    "type_voice_{t}.txt",
    "output_structure_{t}.txt",
    "review_checklist_{t}.txt",
]

# 기사 본문 입력 상한 (기사당). 1면 4건 × 2,800자 ≈ 4.5K tokens — 시스템
# 프롬프트(~25K tokens)는 cache_control 로 2회차부터 캐시 히트.
ARTICLE_BODY_CHARS = int(os.getenv("EDITOR_PICK_V3_BODY_CHARS", "2800"))
# v3 본문 최소 분량 (자) — 미달이면 재시도 대상.
MIN_BODY_CHARS = int(os.getenv("EDITOR_PICK_V3_MIN_BODY_CHARS", "1200"))


def load_v3_system(type_dir: str) -> str:
    parts = []
    for name in _FILE_ORDER:
        p = _V3_PROMPT_DIR / type_dir / name.format(t=type_dir)
        parts.append(p.read_text(encoding="utf-8"))
    parts.append((_V3_PROMPT_DIR / "web_output_contract.md").read_text(encoding="utf-8"))
    return "\n\n".join(parts)


def build_v3_user_message(
    candidates: List[Dict[str, Any]],
    letter_date: str,
    persona_name: str,
) -> str:
    lines = [
        f"오늘은 {letter_date}. 서울경제 지면 1면 기사 {len(candidates)}건이다.",
        f"당신은 {persona_name}. 이 기사들로 오늘의 레터 1편을 작성하라.",
        "",
    ]
    for i, c in enumerate(candidates, 1):
        role = "핵심(1면 톱)" if c.get("is_top") else "핵심"
        body = (c.get("full_body") or c.get("snippet") or "")[:ARTICLE_BODY_CHARS]
        lines += [
            f"[기사 {i} — {role}] {c.get('title') or ''}",
            f"부제: {c.get('subtitle') or ''}",
            f"본문: {body}",
            "",
        ]
    return "\n".join(lines)


def parse_v3_letter(text: str) -> Dict[str, Any]:
    """모델 응답(마커 형식 평문) → letter dict. 실패 시 ValueError.

    JSON 대신 라인 마커 형식을 쓴다 — 3,000자+ 한국어 본문을 JSON 문자열로
    받으면 따옴표·개행 이스케이프 실수로 파싱 실패율이 ~50% 였다 (2026-08-03
    8/3 백필 타임아웃의 원인). 라인 파싱은 그 실패 모드가 없다.
    """
    t = text.strip()
    t = re.sub(r"^```[a-z]*\s*|\s*```$", "", t)

    meta: Dict[str, Any] = {"key_points": [], "keywords": []}
    body: List[str] = []
    in_body = False
    for raw_line in t.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        if in_body:
            body.append(line)
            continue
        m = re.match(r"^(HEADLINE|SUBTITLE|THEME|ARCHETYPE|KEYPOINT|KEYWORD|CLOSING|BODY)\s*:\s*(.*)$", line)
        if not m:
            # 마커 시작 전 잡음(인사 등)은 무시.
            continue
        key, val = m.group(1), m.group(2).strip()
        if key == "BODY":
            in_body = True
        elif key == "KEYPOINT":
            if val:
                meta["key_points"].append(val)
        elif key == "KEYWORD":
            term, _, explain = val.partition("::")
            if term.strip():
                meta["keywords"].append(
                    {"term": term.strip(), "explain": explain.strip()}
                )
        else:
            meta[key.lower()] = val

    headline = (meta.get("headline") or "").strip()
    if not headline:
        raise ValueError("v3 letter: HEADLINE 없음")
    if not body:
        raise ValueError("v3 letter: BODY 없음")
    body_chars = sum(len(x) for x in body)
    if body_chars < MIN_BODY_CHARS:
        raise ValueError(f"v3 letter: body {body_chars}자 < 최소 {MIN_BODY_CHARS}자")
    return {
        "headline": headline[:60],
        "subtitle": (meta.get("subtitle") or "").strip() or None,
        "theme": (meta.get("theme") or "").strip() or None,
        "archetype": (meta.get("archetype") or "").strip() or None,
        "closing_line": (meta.get("closing") or "").strip() or None,
        "body": body,
        "key_points": meta["key_points"][:6],
        "keywords": meta["keywords"][:6],
    }


def generate_v3_letters(
    candidates: List[Dict[str, Any]],
    letter_date: str,
    *,
    bedrock_client: Any,
    model_id: str,
    max_output_tokens: int = 6000,
    max_retries: int = 3,
    on_letter: Optional[Any] = None,  # callable(letter) — 1편 완성 즉시 호출 (즉시 저장용)
) -> Dict[str, Any]:
    """4 페르소나 각각 1 invoke → letter 4편.

    개별 페르소나가 재시도 소진으로 실패하면 그 편만 건너뛴다 (부분 발행 >
    전체 결손). ``on_letter`` 를 주면 각 편이 완성되는 즉시 불린다 — Lambda
    타임아웃이 나도 완성분은 이미 저장돼 있도록 (8/3 백필 전량 유실 재발 방지).
    Returns {"letters": [...], "_usage": {...합산...}}.
    """
    letters: List[Dict[str, Any]] = []
    total_usage = {"input_tokens": 0, "output_tokens": 0}

    for group, type_dir, editor_id, persona_name in V3_EDITORS:
        system_text = load_v3_system(type_dir)
        body = {
            "anthropic_version": "bedrock-2023-05-31",
            "max_tokens": max_output_tokens,
            "system": [{
                "type": "text",
                "text": system_text,
                # .clauderules #7 — 시스템 프롬프트 캐싱 필수. 같은 페르소나의
                # 재시도·다음날 호출에서 캐시 히트.
                "cache_control": {"type": "ephemeral"},
            }],
            "messages": [{
                "role": "user",
                "content": [{
                    "type": "text",
                    "text": build_v3_user_message(candidates, letter_date, persona_name),
                }],
            }],
        }

        letter: Optional[Dict[str, Any]] = None
        for attempt in range(1, max_retries + 1):
            t0 = time.monotonic()
            resp = bedrock_client.invoke_model(
                modelId=model_id,
                body=json.dumps(body),
                contentType="application/json",
                accept="application/json",
            )
            elapsed_s = round(time.monotonic() - t0, 2)
            payload = json.loads(resp["body"].read())
            text = "".join(b.get("text", "") for b in payload.get("content", []))
            usage = payload.get("usage", {})
            total_usage["input_tokens"] += usage.get("input_tokens", 0)
            total_usage["output_tokens"] += usage.get("output_tokens", 0)
            try:
                letter = parse_v3_letter(text)
                logger.info(json.dumps({
                    "event": "editor_pick_v3_invoke_complete",
                    "group": group,
                    "attempt": attempt,
                    "elapsed_s": elapsed_s,
                    "body_chars": sum(len(x) for x in letter["body"]),
                    "input_tokens": usage.get("input_tokens", 0),
                    "output_tokens": usage.get("output_tokens", 0),
                    "cache_read_input_tokens": usage.get("cache_read_input_tokens", 0),
                }))
                break
            except ValueError as exc:
                logger.warning(json.dumps({
                    "event": "editor_pick_v3_invoke_retry",
                    "group": group,
                    "attempt": attempt,
                    "max_retries": max_retries,
                    "error": str(exc)[:300],
                }))

        if letter is None:
            logger.error(json.dumps({
                "event": "editor_pick_v3_group_failed",
                "group": group,
                "letter_date": letter_date,
            }))
            continue

        letter["mbti_group"] = group
        letter["editor_id"] = editor_id
        letters.append(letter)
        if on_letter is not None:
            try:
                on_letter(letter)
            except Exception as exc:
                logger.error(f"on_letter({group}) failed: {exc}", exc_info=True)

    return {"letters": letters, "_usage": total_usage}


def enrich_full_bodies(candidates: List[Dict[str, Any]], s3_client: Any) -> None:
    """후보에 S3 original.json 전문을 붙인다 (실패 시 snippet 유지).

    Collector 는 metadata 에 400자 preview 만 남기므로, v3 의 에세이 밀도를
    위해 기사 전문(content_ko)을 읽어 ``full_body`` 로 주입한다.
    """
    for c in candidates:
        try:
            doc = s3_client.get_article_file(c["article_id"], "original.json")
        except Exception as exc:
            logger.warning(f"enrich_full_bodies({c.get('article_id')}): {exc}")
            continue
        if doc:
            content = doc.get("content_ko") or ""
            if content:
                c["full_body"] = content
