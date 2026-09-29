"""필수뉴스 분류(Step1) — 후보 기사(제목+부제+리드200)를 Sonnet 5로 배치
채점한다. `run.py`가 특별 4탭 임계값(8.0)과 일반 임계값(7.0)을 어떻게
적용할지는 여기서 관여하지 않는다 — 여기는 채점만, 컷라인 판단은 호출부.

2026-08-22 설계 대화에서 확정: 본문 전체가 아니라 제목+부제+리드
200자만 넣는다(비용 대비 판단 정확도 손실이 적다고 판단 — 한국 기사는
역피라미드 구조라 리드에 핵심이 이미 담김, 어차피 선정된 기사는 Step2가
본문 전체를 다시 읽음). 프롬프트(`mustknow/published.md`)에 환각 방지
규칙(fundamental_rule)과 감별 기준(홍보성/인사/부고/중복 자동 감점)을
이미 명시해뒀다 — video의 validate_script()처럼 코드로 사실 누락을
검증할 수는 없다(이건 사실 추출이 아니라 채점이라 층위가 다르다).
"""
import json
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "common"))
from bedrock_client import call_text
from json_extract import extract_fenced_json_text, loads_lenient, extract_json_object  # 2026-08-23 공용화

MODEL = "arn:aws:bedrock:us-east-1:887078546492:application-inference-profile/zmdham3vkj89"  # lens-mustknow-sonnet-5

# 한 콜에 넣는 후보 수 상한. 원래 60→30으로 줄여도 실제로는 max_tokens=9000
# 안에서 응답이 중간에 잘려 JSON을 완성 못했다(실측: 30건 배치 응답이 4330자
# 만에 마지막 항목 reasoning 도중 끊김) — Sonnet 5는 항목별 reasoning이
# 길고 새 토크나이저가 같은 텍스트에도 더 많은 토큰을 쓴다. 20건 +
# max_tokens 넉넉히로 더 낮춘다.
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
    """max_tokens을 넉넉히 줘도 가끔 응답이 마지막 항목 도중 끊길 수 있다
    (실측: 30건 배치에서 마지막 reasoning 문장 중간에 끊긴 사례) — 닫는
    fence가 없어도, 완성된 객체까지만이라도 건져서 쓴다. 마지막으로 완전히
    닫힌 `}` 뒤를 잘라내고 배열을 닫아 재시도. 그래도 실패하면 포기(호출부가
    이 배치 전체를 다음 회차로 이월시킨다 — 없는 값을 지어내지 않는다)."""
    last_close = text.rfind("}")
    if last_close == -1:
        raise ValueError("완성된 JSON 객체가 하나도 없습니다")
    candidate = text[: last_close + 1].rstrip()
    if candidate.endswith(","):
        candidate = candidate[:-1]
    return loads_lenient(candidate + "\n]")


def _extract_json_array(text: str) -> list[dict]:
    """common/json_extract.py의 extract_json_object와 같은 톤 — 배열용으로
    새로 작성. 한 함수로 합치기엔 단일 객체 vs 배열이라 반환 형태가 달라
    그대로 분리(2026-09-04 — webtoon/pipeline.py·video/generate_script.py의
    객체용 버전은 서로 완전히 같아서 그 둘만 extract_json_object로 통합됨,
    이 파일은 배열 살리기 로직이 이 파일만의 것이라 여전히 분리). 코드블록
    추출 단계(앞 두 단계)만 공용(common/json_extract.py, 2026-08-23)."""
    fenced = extract_fenced_json_text(text, opener="[")
    if fenced is not None:
        # 2026-08-24 — 펜스를 찾아도 그 안이 깨져 있을 수 있다(모델이 \' 처럼
        # JSON 에 없는 이스케이프를 쓰는 경우). 예전엔 여기서 바로 예외가 나
        # 아래 폴백들이 아예 실행되지 않았다.
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

# 2026-09-28 실측 — 응답이 완성됐는데도 문법이 깨지는 사례 발견:
# {"key": "20095049" if False else "20095230", ...} 처럼 모델이 key를
# 바꾸던 내부 사고 과정이 그대로 출력에 leak됐다. classify.py의 기존
# 방어(_salvage_truncated_array)는 "응답이 잘리는" 실패 모드용이라 이건
# 못 잡는다 — "else" 뒤의 값이 모델의 최종 선택으로 보여(먼저 쓴 값을
# 버리고 바꾼 흔적), else 쪽 문자열만 남기고 치환한다. 그래도 파싱이
# 안 되면 값을 지어내지 않고 포기한다(기존 원칙 유지).
_TERNARY_LEAK_RE = re.compile(r'"[^"]*"\s+if\s+.+?\s+else\s+("[^"]*")')


def _repair_ternary_leak(text: str) -> str:
    return _TERNARY_LEAK_RE.sub(r"\1", text)


def _build_general_prompt(
    candidates: list[dict], context_articles: list[dict] | None, max_count: int
) -> str:
    lines = []
    # 2026-09-28 — 하루 누적 캡(run.py::_GENERAL_DAILY_CAP) 도입에 따라
    # "최대 20건"이 시스템 프롬프트(published.md)에 고정돼 있어도, 오늘
    # 이미 몇 건 발행됐으면 남은 자리만큼만 고르도록 여기서 덮어쓴다.
    lines.append(
        f"오늘 목표(20건) 중 남은 자리는 {max_count}건입니다. "
        f"위 프롬프트의 '최대 20건'은 이 숫자로 대체합니다 — 최대 {max_count}건만 고르세요.\n"
    )
    # 2026-09-28(v1.5) — "오늘의 흐름 파악"이 선정 후보(=이번 회차 델타,
    # 이미 평가한 건 seen 처리돼 빠짐)만 보면 표본이 작아진다. 하루
    # 4~8회 도는데 첫 회차가 아닌 이상 이번 회차 델타는 몇~몇십 건뿐일
    # 수 있다 — "오늘 전체적으로 뭐가 화제인지" 판단엔 부적합. 맥락
    # 파악용으로는 그날 지금까지 게재된 전체 기사(제목+카테고리만,
    # 선정 대상 아님)를 따로 준다 — run.py의 all_articles(seen 여부
    # 무관하게 discovery.fetch_articles(today) 전체)를 그대로 넘겨받는다.
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
    """"일반" 카테고리 최대 `max_count`건 직접 선정 — score_articles()처럼
    배치 채점이 아니라, 소거를 거친 후보 전체를 한 번에 보고 LLM이 종합
    판단한다(docs/prompt/selection/ v1.4 설계, 2026-09-28 실 Bedrock
    호출로 검증됨 — today_context·다양성 규칙·화제×경제 교차점 전부
    의도대로 작동 확인, JSON 파싱 버그는 이 함수의 _repair_ternary_leak로
    대응).

    `context_articles`(v1.5, 2026-09-28) — "오늘의 흐름 파악"이 선정
    후보(회차별 델타, 표본이 작을 수 있음)만 보고 판단하지 않도록, 그날
    지금까지 게재된 전체 기사(제목+카테고리만)를 별도로 넘긴다. `run.py`의
    `all_articles`를 그대로 전달하면 된다 — None이면 후보만으로 판단
    (이전 버전과 동일 동작, 하위호환).

    `max_count`(하루 누적 캡, 2026-09-28) — 오늘 이미 발행된 건수를 뺀
    나머지 자리. 프롬프트 원문(published.md)엔 "최대 20건"이 고정
    문구로 박혀 있어서, `_build_general_prompt`가 이 값으로 덮어쓰는
    지시를 앞에 붙인다.

    반환값: {"today_context": str, "candidates_total": int,
    "excluded_count": int, "excluded_reasons": list[str],
    "selected": [{"key","category","reason"}, ...]} 또는 파싱 완전
    실패 시 None(호출부는 이번 회차 "일반" 선정을 스킵하고 다음
    회차에 재시도 — 값을 지어내지 않는다)."""
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
        # 방어적 하드컷 — 프롬프트에 max_count를 명시해도 모델이 그 수를
        # 넘겨 돌려줄 가능성을 배제 못 한다(자체검증 지시라 강제력 없음).
        # 2026-09-28 발견(Claude 코드 리뷰) — 이 하드컷으로 잘려나간
        # 기사들이 run.py에서 "LLM이 거절한 기사"와 똑같이 seen 처리돼
        # 영구 제외되던 버그가 있었다(캡이 리셋되는 내일도 재검토 못 함,
        # 좋은 기사가 순전히 타이밍 때문에 사라짐). 잘려나간 키를
        # 별도로 노출해서 run.py가 "진짜 거절"과 "자리 없어서 밀림"을
        # 구분할 수 있게 한다 — 프롬프트에도 중요도 순 정렬 지시를
        # 추가했으니(selection_prompt.md) 최소한 하위권부터 잘리지만,
        # 정렬 지시엔 강제력이 없어 이 안전장치는 유지한다.
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
