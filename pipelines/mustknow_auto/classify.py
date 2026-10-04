"""필수뉴스 분류(Step1) — 후보 기사의 제목+부제+리드 200자를 Sonnet 5로 배치 채점한다.
임계값(특별 4탭 8.0, 일반 7.0) 적용은 호출부(run.py)가 맡고 여기서는 채점만 한다.

본문 전체 대신 리드만 쓰는 이유는 비용 대비 정확도 손실이 작아서이다(한국 기사는
역피라미드 구조이고, 선정된 기사는 Step2가 본문을 다시 읽는다). 환각 방지 규칙과 감점
기준(홍보성/인사/부고/중복)은 프롬프트(`mustknow/published.md`)에 명시돼 있다.
"""
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "common"))
from bedrock_client import call_text
from json_extract import extract_fenced_json_text, loads_lenient, extract_json_object

MODEL = "arn:aws:bedrock:us-east-1:887078546492:application-inference-profile/zmdham3vkj89"  # lens-mustknow-sonnet-5

# 한 호출에 넣는 후보 수 상한. 30건 배치에서 max_tokens 안에 응답이 마지막 항목 reasoning
# 도중 끊겨 JSON이 완성되지 않았다(실측). Sonnet 5는 항목별 reasoning이 길고 토큰 소모가
# 많아 20건으로 낮추고 max_tokens를 넉넉히 둔다.
_CHUNK = 20
_MAX_TOKENS = 16000
_LEAD_CHARS = 200


def _lead(article: dict) -> str:
    return (article.get("content") or "")[:_LEAD_CHARS]


def _build_batch_prompt(batch: list[dict]) -> str:
    lines = ["다음 후보 기사들을 채점하세요.\n"]
    for i, a in enumerate(batch, 1):
        lines.append(
            f"[{i}] key={a['key']}\n"
            f"제목: {a['title']}\n"
            f"부제: {a.get('sub_title') or '(없음)'}\n"
            f"리드: {_lead(a)}\n"
        )
    return "\n".join(lines)


def _salvage_truncated_array(text: str) -> list[dict]:
    """응답이 마지막 항목 도중 끊겨도 완성된 객체까지만 건져 쓴다. 마지막으로 완전히 닫힌
    `}` 뒤를 잘라 배열을 닫고 재파싱하며, 실패하면 포기한다(호출부가 해당 배치를 다음
    회차로 이월하고 없는 값을 지어내지 않는다)."""
    last_close = text.rfind("}")
    if last_close == -1:
        raise ValueError("완성된 JSON 객체가 하나도 없습니다")
    candidate = text[: last_close + 1].rstrip()
    if candidate.endswith(","):
        candidate = candidate[:-1]
    return loads_lenient(candidate + "\n]")


def _extract_json_array(text: str) -> list[dict]:
    """JSON 배열 추출. 단일 객체용 extract_json_object와 반환 형태가 달라 분리돼 있으며,
    코드블록 추출 단계만 common/json_extract.py를 공용으로 쓴다. 닫는 fence가 없으면
    잘린 응답으로 보고 _salvage_truncated_array로 복구한다."""
    fenced = extract_fenced_json_text(text, opener="[")
    if fenced is not None:
        # 펜스 안이 깨져 있을 수 있다(JSON에 없는 \' 이스케이프 등). 예외로 끝내지 않고 아래 폴백으로 넘긴다.
        try:
            return loads_lenient(fenced)
        except json.JSONDecodeError:
            pass

    # 닫는 fence 자체가 없음(응답이 잘렸을 가능성) — 여는 fence 뒤부터라도 건진다.
    open_match = re.search(r"```json\s*\n", text)
    if open_match is None:
        open_match = re.search(r"\[\s*\n\s*\{", text)
        start = open_match.start() if open_match else None
    else:
        start = open_match.end()
    if start is None:
        raise ValueError("Bedrock 응답에서 JSON 배열 시작점을 찾지 못했습니다")
    return _salvage_truncated_array(text[start:])


def score_articles(guide: str, articles: list[dict]) -> dict[str, dict]:
    """key -> {impact, timeliness, fact_density, policy_change, novelty, total, reasoning}
    Bedrock 응답 파싱에 실패한 배치는 건너뛴다(그 배치의 기사들은 이번 회차엔
    채점 없이 스킵되고, seen 마킹도 안 되어 다음 회차에 다시 시도됨)."""
    results: dict[str, dict] = {}
    for i in range(0, len(articles), _CHUNK):
        batch = articles[i : i + _CHUNK]
        prompt = _build_batch_prompt(batch)
        try:
            raw = call_text(guide, prompt, model=MODEL, max_tokens=_MAX_TOKENS)
            rows = _extract_json_array(raw)
        except Exception as e:
            print(f"[mustknow] 배치({i}~{i+len(batch)}) 채점 실패, 다음 회차로 이월 — {e}")
            continue
        valid_keys = {a["key"] for a in batch}
        for row in rows:
            key = row.get("key")
            if key in valid_keys:
                results[key] = row
        missing = valid_keys - {row.get("key") for row in rows}
        if missing:
            print(f"[mustknow] 배치 응답에서 {len(missing)}건 누락(다음 회차로 이월): {missing}")
    return results


_GENERAL_LEAD_CHARS = 200
_GENERAL_MAX_TOKENS = 12000

# 응답이 완성돼도 문법이 깨지는 경우가 있다. 모델이 key를 바꾸던 사고 과정이
# `{"key": "A" if False else "B", ...}` 형태로 출력에 새어 나온다. else 뒤 값이 최종
# 선택이므로 그 문자열만 남기고 치환한다. 그래도 파싱되지 않으면 값을 지어내지 않고 포기한다.
_TERNARY_LEAK_RE = re.compile(r'"[^"]*"\s+if\s+.+?\s+else\s+("[^"]*")')


def _repair_ternary_leak(text: str) -> str:
    return _TERNARY_LEAK_RE.sub(r"\1", text)


def _build_general_prompt(
    candidates: list[dict], context_articles: list[dict] | None, max_count: int
) -> str:
    lines = []
    # 프롬프트(published.md)에는 "최대 20건"이 고정돼 있으므로, 오늘 이미 발행된 건수를 뺀
    # 남은 자리(run.py::_GENERAL_DAILY_CAP)만큼만 고르도록 여기서 덮어쓴다.
    lines.append(
        f"오늘 목표(20건) 중 남은 자리는 {max_count}건입니다. "
        f"위 프롬프트의 '최대 20건'은 이 숫자로 대체합니다 — 최대 {max_count}건만 고르세요.\n"
    )
    # 선정 후보(이번 회차 델타)만으로는 "오늘 무엇이 화제인지" 판단할 표본이 작다.
    # 그날 게재된 전체 기사(제목+카테고리)를 맥락 파악용으로 따로 전달한다.
    if context_articles:
        lines.append(
            "## 오늘 지금까지 게재된 전체 기사 목록 (맥락 파악 전용 — 선정 대상 아님, 이 중에서 고르지 않는다)\n"
        )
        for a in context_articles:
            lines.append(f"- [{a['top_category']}] {a['title']}")
        lines.append("")

    lines.append("## 선정 후보 (이번 회차에 새로 고를 수 있는 기사 — 여기서만 고른다)\n")
    for i, a in enumerate(candidates, 1):
        lead = (a.get("content") or "")[:_GENERAL_LEAD_CHARS]
        lines.append(
            f"[{i}] key={a['key']}\n"
            f"카테고리: {a['top_category']}\n"
            f"제목: {a['title']}\n"
            f"부제: {a.get('sub_title') or '(없음)'}\n"
            f"리드: {lead}\n"
        )
    return "\n".join(lines)


def select_general_articles(
    guide: str,
    candidates: list[dict],
    context_articles: list[dict] | None = None,
    max_count: int = 20,
) -> dict | None:
    """"일반" 카테고리 기사를 최대 `max_count`건 직접 선정한다. 배치 채점이 아니라 소거를
    거친 후보 전체를 한 번에 보고 LLM이 종합 판단한다(설계: docs/prompt/selection/).

    `context_articles`: 그날 게재된 전체 기사(제목+카테고리). 맥락 파악 전용이며 None이면
    후보만으로 판단한다.
    `max_count`: 하루 누적 캡에서 오늘 발행 건수를 뺀 남은 자리. 프롬프트 원문의 "최대 20건"
    고정 문구를 `_build_general_prompt`가 이 값으로 덮어쓴다.

    반환값: {"today_context": str, "candidates_total": int, "excluded_count": int,
    "excluded_reasons": list[str], "selected": [{"key","category","reason"}, ...],
    "overflow_keys": list[str]} 또는 파싱 완전 실패 시 None(호출부는 이번 회차 선정을
    스킵하고 다음 회차에 재시도한다)."""
    if not candidates or max_count <= 0:
        return None
    user_message = _build_general_prompt(candidates, context_articles, max_count)
    try:
        raw = call_text(guide, user_message, model=MODEL, max_tokens=_GENERAL_MAX_TOKENS)
    except Exception as e:
        print(f"[mustknow] select_general_articles Bedrock 호출 실패 — {e}")
        return None

    for attempt_text in (raw, _repair_ternary_leak(raw)):
        try:
            data = extract_json_object(attempt_text)
        except (ValueError, json.JSONDecodeError):
            continue
        if not isinstance(data, dict) or "selected" not in data:
            continue
        valid_keys = {a["key"] for a in candidates}
        selected = [
            row for row in data.get("selected", [])
            if isinstance(row, dict) and row.get("key") in valid_keys
        ]
        # 방어적 하드컷: 프롬프트로 max_count를 지시해도 모델이 초과해 반환할 수 있다.
        # 잘려난 키는 overflow_keys로 노출해, run.py가 "LLM이 거절한 기사"(seen 처리)와
        # "자리가 없어 밀린 기사"(재검토 가능)를 구분하게 한다.
        data["selected"] = selected[:max_count]
        data["overflow_keys"] = [row["key"] for row in selected[max_count:]]
        return data

    print("[mustknow] select_general_articles JSON 파싱 실패(치환 후에도) — 이번 회차 스킵")
    return None


if __name__ == "__main__":
    import argparse

    sys.path.insert(0, str(Path(__file__).parent.parent / "common"))
    import ddb_prompt

    parser = argparse.ArgumentParser(description="discovery 결과 JSON 파일을 받아 채점만 해보는 단독 테스트")
    parser.add_argument("articles_json", help="discovery.fetch_articles() 결과를 json.dump한 파일")
    args = parser.parse_args()

    arts = json.loads(Path(args.articles_json).read_text(encoding="utf-8"))
    guide = ddb_prompt.load_prompt("mustknow")
    scores = score_articles(guide, arts)
    for key, row in scores.items():
        print(f"{row.get('total')}\t{key}\t{row.get('reasoning', '')[:60]}")
