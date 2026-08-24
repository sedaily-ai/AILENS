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
from json_extract import extract_fenced_json_text, loads_lenient  # 2026-08-23 공용화

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
    """generate_script.py의 extract_json_block과 같은 톤 — 배열용으로 새로 작성.
    한 함수로 합치기엔 단일 객체 vs 배열이라 반환 형태가 달라 그대로 분리.
    코드블록 추출 단계(앞 두 단계)만 webtoon/pipeline.py·
    video/generate_script.py와 공용(common/json_extract.py, 2026-08-23) —
    그 뒤 배열 살리기 로직은 이 파일만의 것이라 계속 분리해서 둔다."""
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
