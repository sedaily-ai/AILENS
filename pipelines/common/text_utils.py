"""`pipelines/` 공용 텍스트 후처리 — 여러 스크립트에서 반복 작성했던
"GPT가 감싸서 준 코드블록 펜스 벗기기"를 한 곳으로 뽑았다(2026-08-20)."""
import re

_FENCE_RE = re.compile(r"^```\w*\n|```\s*$", re.MULTILINE)


def strip_code_fence(text: str) -> str:
    """앞뒤 ```(옵션: 언어 태그) 펜스만 제거. 본문 중간의 ```는 건드리지 않는다."""
    return _FENCE_RE.sub("", text.strip()).strip()
