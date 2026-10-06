"""Bedrock 응답에서 JSON 텍스트를 뽑는 공용부.

webtoon/pipeline.py, video/generate_script.py, mustknow_auto/classify.py가 함께 쓴다.
`extract_fenced_json_text`/`loads_lenient`는 코드블록 추출과 이스케이프 수리를,
`extract_json_object`는 객체(dict) 응답의 폴백 체인을 담당한다.
배열 응답의 잘린 출력 복구는 형태가 달라 mustknow_auto/classify.py에 따로 둔다.
"""
import json
import re
from typing import Any, Optional


def extract_fenced_json_text(text: str, *, opener: str) -> Optional[str]:
    """```json 코드블록 → 없으면 opener('{' 또는 '[')로 시작하는 일반 ```
    코드블록 중 마지막 것. 둘 다 없으면 None(호출부가 이어서 자기만의
    폴백을 진행)."""
    match = re.search(r"```json\s*\n(.*?)```", text, re.DOTALL)
    if match:
        return match.group(1)

    blocks = re.findall(r"```\s*\n(.*?)```", text, re.DOTALL)
    candidates = [b for b in blocks if b.strip().startswith(opener)]
    if candidates:
        return candidates[-1]

    return None


# JSON 이 허용하는 이스케이프 문자. 이 밖의 \X 는 전부 문법 오류다.
_VALID_ESCAPE_CHARS = '"\\/bfnrtu'


def repair_invalid_escapes(text: str) -> str:
    r"""JSON 문법에 없는 역슬래시 이스케이프를 리터럴 문자로 되돌린다.

    장면연출 프롬프트 출력은 한국어 지문 안에 작은따옴표 문자열을 많이 담는데
    (캡션 박스 'D+20일'), Claude 가 이를 종종 \' 로 이스케이프한다.
    JSON 이 허용하는 건 " \ / b f n r t u 뿐이라 \' 는 파싱 실패다.

    모델이 \' 를 쓸 때 의도한 건 언제나 따옴표 문자 자체이므로 역슬래시만
    떼어낸다. 정상 이스케이프(\n, \", 가 …)와 리터럴 역슬래시(\\)는
    그대로 둔다 — \\ 를 \ 로 줄여버리면 경로 문자열이 깨진다.
    """
    out: list[str] = []
    i, n = 0, len(text)
    while i < n:
        ch = text[i]
        if ch != "\\":
            out.append(ch)
            i += 1
            continue
        if i + 1 >= n:
            i += 1  # 끝에 홀로 남은 역슬래시 — 버린다
            continue

        nxt = text[i + 1]
        if nxt == "u":
            # \uXXXX 는 16진수 4자리가 따라올 때만 유효한 이스케이프다.
            if re.fullmatch(r"[0-9a-fA-F]{4}", text[i + 2:i + 6] or ""):
                out.append(text[i:i + 6])
                i += 6
            else:
                out.append("u")
                i += 2
            continue
        if nxt in _VALID_ESCAPE_CHARS:
            # \\ 도 여기서 통째로 소비된다 — 두 번째 역슬래시를 다시 읽지 않는다.
            out.append(ch)
            out.append(nxt)
            i += 2
            continue

        out.append(nxt)  # 잘못된 이스케이프 — 역슬래시만 제거
        i += 2

    return "".join(out)


def loads_lenient(text: str) -> Any:
    """json.loads() 를 시도하고, 문법 오류면 이스케이프를 수리해 한 번 더 시도한다.

    수리 후에도 실패하면 JSONDecodeError 를 그대로 올린다 — 호출부의 기존
    폴백 사슬이 계속 동작해야 하기 때문이다.
    """
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        return json.loads(repair_invalid_escapes(text))


def extract_json_object(text: str) -> dict:
    """Bedrock 응답에서 JSON 객체(dict) 하나를 뽑는다.

    코드블록 우선 → 없으면 원문 전체 → 첫 '{'~마지막 '}' 구간 순으로
    폴백해서 유효한 JSON이면 형식과 무관하게 파싱한다. 모델이 코드블록
    지침을 안 따르고 순수 JSON만 내는 경우가 있고, 펜스 안이 깨져 있을
    수도 있어(\\' 같은 잘못된 이스케이프) 각 단계가 실패하면 다음
    폴백으로 넘어간다.
    """
    fenced = extract_fenced_json_text(text, opener="{")
    if fenced is not None:
        try:
            return loads_lenient(fenced)
        except json.JSONDecodeError:
            pass

    stripped = text.strip()
    try:
        return loads_lenient(stripped)
    except json.JSONDecodeError:
        pass

    start, end = stripped.find("{"), stripped.rfind("}")
    if start != -1 and end > start:
        try:
            return loads_lenient(stripped[start:end + 1])
        except json.JSONDecodeError:
            pass

    raise ValueError("Bedrock 응답에서 JSON을 찾지 못했습니다")
