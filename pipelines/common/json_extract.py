"""Bedrock 응답에서 JSON 텍스트를 코드블록으로 감싸 찾는 공용 앞부분.

webtoon/pipeline.py, video/generate_script.py, mustknow_auto/classify.py
셋 다 "```json 코드블록 우선 → 언어 태그 없는 ``` 코드블록 중 opener로
시작하는 마지막 것" 두 단계까지는 완전히 같은 정규식을 각자 복사해 쓰고
있었다(2026-08-23 코드 리팩토링 감사에서 발견). 그 뒤 폴백(원문 전체 시도,
'{'~'}' 구간 추출 vs 배열 살리기)은 객체/배열이라 반환 형태 자체가 달라
공용화하지 않고 각 파일에 그대로 둔다 — 이 함수는 텍스트만 반환하고
json.loads()는 호출부 책임이다.
"""
import re
from typing import Optional


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
