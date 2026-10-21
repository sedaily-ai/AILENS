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


# Sonnet 5 전환(2026-10-11) 뒤 레터·팟캐스트·영상 대본에 받침만 틀린 음절이 섞여 나온다
# (10-12~10-21 발행 1000건 중 50건: "한 번쯜", "언제쯘", "부딫혀요" 등). 틀린 음절은 거의 다
# KS X 1001 상용 한글 2,350자 밖이라, 그 밖의 음절을 오타 후보로 본다.
# 자주 나오는 것은 문맥과 무관하게 바로잡을 수 있어 표로 고친다.
_HANGUL_TYPO_FIXES = str.maketrans({
    **{c: "쯤" for c in "쯜쯘쯌쯍쯸쯡쯥쯽"},
    **{c: "딪" for c in "딖딫딮"},
})


def find_rare_hangul(text: str) -> list[str]:
    """KS X 1001 상용 한글 2,350자 밖의 음절을 나온 순서대로(중복 없이) 돌려준다.
    CPython euc-kr 코덱은 상용 밖 음절을 8바이트 조합형으로 인코딩하므로 길이로 가른다."""
    seen: list[str] = []
    for ch in text:
        if "가" <= ch <= "힣" and ch not in seen and len(ch.encode("euc-kr")) != 2:
            seen.append(ch)
    return seen


def fix_hangul_typos(text: str) -> tuple[str, list[str]]:
    """알려진 받침 오타를 고치고 (고친 본문, 남은 오타 후보 음절) 을 돌려준다.
    남은 후보는 문맥 없이 고칠 수 없으므로 호출부가 재생성하거나 로그로 남긴다."""
    fixed = text.translate(_HANGUL_TYPO_FIXES)
    return fixed, find_rare_hangul(fixed)


def strip_code_fence(text: str) -> str:
    """앞뒤 ```(옵션: 언어 태그) 펜스 + FACT_IDS 트레일러 제거.
    본문 중간의 ```는 건드리지 않는다."""
    body, _ = extract_fact_ids(text)
    return _FENCE_RE.sub("", body.strip()).strip()
