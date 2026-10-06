"""`pipelines/` 공용 텍스트 후처리 — 코드블록 펜스 벗기기와 FACT_IDS 트레일러 제거.

레터·팟캐스트 산출물 맨 끝에는 커버리지 대조용 트레일러 `FACT_IDS: [1, 3, 4]` 가 붙는다.
이 줄이 본문에 남으면 레터는 본문 문단으로 발행되고(parse_letters 에 종료 조건이
없다) 팟캐스트는 Polly 가 그대로 소리 내어 읽으므로 여기서 떼어낸다.
"""
import re

_FENCE_RE = re.compile(r"^```\w*\n|```\s*$", re.MULTILINE)

# 대문자 ASCII 마커라 한국어 본문과 충돌하지 않는다. 규격상 코드블록 바깥 마지막 줄이지만
# 모델이 블록 안에 넣는 경우에 대비해 위치와 무관하게 지운다.
_FACT_IDS_RE = re.compile(r"^[ \t]*FACT_IDS[ \t]*:[ \t]*\[([0-9,\s]*)\][ \t]*$", re.MULTILINE)


def extract_fact_ids(text: str) -> tuple[str, list[int]]:
    """FACT_IDS 트레일러를 본문에서 떼어내고 (본문, id 목록) 을 돌려준다.

    트레일러가 없으면 (원문 그대로, []) — 스펙 개정 전 산출물도 그대로 통과한다.
    """
    ids: list[int] = []
    for m in _FACT_IDS_RE.finditer(text):
        ids.extend(int(tok) for tok in m.group(1).split(",") if tok.strip())
    return _FACT_IDS_RE.sub("", text).strip(), ids


def strip_code_fence(text: str) -> str:
    """앞뒤 ```(옵션: 언어 태그) 펜스 + FACT_IDS 트레일러 제거.
    본문 중간의 ```는 건드리지 않는다."""
    body, _ = extract_fact_ids(text)
    return _FENCE_RE.sub("", body.strip()).strip()
