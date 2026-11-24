"""기사 txt에 실린 보도사진 주소 읽기(2026-11-23).

기사 txt는 `prism_auto.py`(프리즘 8그룹)·`prism_paper.py`(지면 PG1~PG4)가 일일 기사 XML에서 만들고,
대본·장면·렌더·업로드를 맡는 `prism_batch.py`가 S3에서 그대로 받아 읽는다. 사진 주소는 기사 한 건마다
머리줄 `사진: <주소>`로 들어간다(XML의 `<image href="...">`, `discovery._parse_item()['photo_url']`).

- `사진` 줄이 없는 txt(2026-11-23 이전에 만든 파일, 마케팅팀이 손으로 만든 파일)는 예전과 똑같이 읽힌다.
- 지면 편처럼 기사가 2건이면 사진도 2개다 — 썸네일에는 첫 기사(TOP 기사) 사진을 쓴다.
- 대본 AI에는 이 줄을 빼고 넘긴다(`strip_photo_lines`). 주소 속 숫자가 금액·날짜 검수에 섞이지 않게.

사진 사용 권한은 이 모듈이 판단하지 않는다 — 자사(서울경제) 기사 사진만 txt에 실린다.
"""
from __future__ import annotations

import re

# 줄 전체가 "사진: 주소"인 줄만 본다(본문 속 "사진"이라는 낱말과 겹치지 않게).
_PHOTO_LINE_RE = re.compile(r"^[ \t]*사진[ \t]*:[ \t]*(\S+)[ \t]*$", re.M)
_STRIP_RE = re.compile(r"^[ \t]*사진[ \t]*:[ \t]*\S+[ \t]*(?:\n|$)", re.M)


def photo_urls(article_text: str) -> list[str]:
    """기사 txt의 사진 주소를 기사 순서대로. http(s)가 아닌 줄은 버린다."""
    return [u for u in _PHOTO_LINE_RE.findall(article_text or "") if u.startswith(("http://", "https://"))]


def primary_photo_url(article_text: str) -> str | None:
    """썸네일 배경으로 쓸 첫 사진 — 없으면 None."""
    urls = photo_urls(article_text)
    return urls[0] if urls else None


def strip_photo_lines(article_text: str) -> str:
    """`사진:` 줄을 뺀 기사 본문 — 대본 AI·검수에 넘기는 쪽은 전부 이걸 쓴다."""
    return _STRIP_RE.sub("", article_text or "")
