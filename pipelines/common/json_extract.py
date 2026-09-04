"""Bedrock 응답에서 JSON 텍스트를 뽑는 공용부.

webtoon/pipeline.py, video/generate_script.py, mustknow_auto/classify.py
셋 다 "```json 코드블록 우선 → 언어 태그 없는 ``` 코드블록 중 opener로
시작하는 마지막 것" 두 단계까지는 완전히 같은 정규식을 각자 복사해 쓰고
있었다(2026-08-23 코드 리팩토링 감사에서 발견) — `extract_fenced_json_text`/
`loads_lenient`로 공용화.

그 뒤 폴백은 mustknow_auto/classify.py(배열, `_salvage_truncated_array`로
잘린 배열을 살림)만 형태가 정말 달라 분리돼 있다. 반면 webtoon/pipeline.py의
`_extract_json_block`과 video/generate_script.py의 `extract_json_block`은
둘 다 객체(dict) 응답을 다루는데 폴백 로직까지 바이트 단위로 동일했다
(2026-09-04 P2 리팩토링 감사에서 재확인 — 애초에 "객체/배열이라 통합 난이도
있다"고 판단해 안 건드렸던 건데, 실제로는 webtoon·video 둘 다 객체라 통합
난이도가 없었다). 그래서 이 둘만 `extract_json_object`로 마저 통합한다.
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

    2026-08-24 — 실운영에서 기사가 통째로 스킵되는 실패의 원인. 장면연출
    프롬프트 출력은 한국어 지문 안에 작은따옴표 문자열을 많이 담는데
    (캡션 박스 'D+20일'), Claude 가 이걸 종종 \' 로 이스케이프한다.
    JSON 이 허용하는 건 " \ / b f n r t u 뿐이라 \' 는 파싱 실패다
    (08-24 08:20 런: Invalid \escape ... char 2550, 기사 1건 유실).

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
    폴백해서 실제로 유효한 JSON이면 형식과 무관하게 파싱되게 한다
    (2026-08-23, 실운영에서 Claude가 ```json 코드블록 지침을 안 따르고
    순수 JSON 텍스트만 반환하는 사례로 추가). 펜스를 찾아도 그 안이
    깨져 있을 수 있어(모델이 \\' 처럼 JSON에 없는 이스케이프를 쓰는 경우,
    2026-08-24) 각 단계에서 파싱 실패해도 다음 폴백으로 넘어간다.

    webtoon/pipeline.py의 `_extract_json_block`과 video/generate_script.py의
    `extract_json_block`이 폴백까지 바이트 단위로 동일해서 통합(2026-09-04).
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
