"""headline → URL slug 변환 (CMS spec §5.1.2).

한글은 그대로 둔다 (URL 인코딩은 브라우저가 처리). 공백·특수문자만 '-' 로 접는다.
중복 처리(-2, -3)는 DB 를 봐야 하므로 repo 계층 담당 — 이 파일은 순수 함수다.
"""
from __future__ import annotations

import re

_MAX_LEN = 80
# 한글·영숫자만 남기고 나머지는 구분자로 취급.
_NON_SLUG = re.compile(r"[^0-9A-Za-z가-힣]+")


def slugify(publish_date: str, headline: str) -> str:
    """``'2026-07-27-오늘의-소식'`` 형태. 최대 80자, 끝의 '-' 는 제거."""
    tail = _NON_SLUG.sub("-", (headline or "").strip()).strip("-")
    base = f"{publish_date}-{tail}" if tail else publish_date
    return base[:_MAX_LEN].rstrip("-")
