"""기사 txt의 사진 줄 읽기 — 유튜브 썸네일 배경(2026-11-23).

prism_auto가 만드는 기사 txt는 머리줄에 "사진: <주소>"를 넣는다. 대본 AI·금액/날짜 검수에는 이 줄을 빼고 넘긴다.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))

import article_photo  # noqa: E402

ARTICLE = """제목: Memory prices slide as insurance agency faces shutdown
기자: 홍길동
날짜: 2026-11-17 10:00
지면: 1면
카테고리: 경제
URL: https://www.sedaily.com/article/20000001
사진: https://wimg.sedaily.com/NewsImg/2026/11/17/ABC123_P1.jpg

본문 첫 문단입니다. 사진 설명에 숫자 112만 원이 있다.
"""


def test_primary_photo_url_from_header_line():
    assert article_photo.primary_photo_url(ARTICLE) == "https://wimg.sedaily.com/NewsImg/2026/11/17/ABC123_P1.jpg"


def test_photo_urls_keeps_article_order():
    two = ARTICLE + "\n\n" + ARTICLE.replace("20000001", "20000002").replace("ABC123", "DEF456")
    assert article_photo.photo_urls(two) == [
        "https://wimg.sedaily.com/NewsImg/2026/11/17/ABC123_P1.jpg",
        "https://wimg.sedaily.com/NewsImg/2026/11/17/DEF456_P1.jpg",
    ]


def test_no_photo_line_gives_none():
    assert article_photo.primary_photo_url("제목: 사진 없는 기사\nURL: https://www.sedaily.com/article/1") is None
    assert article_photo.photo_urls("") == []


def test_line_must_start_the_line_and_be_a_web_address():
    text = "본문에서 사진: https://example.com/a.jpg 라고 쓴 문장\n사진: /local/path.jpg\n사진: https://ok.example.com/b.jpg"
    assert article_photo.photo_urls(text) == ["https://ok.example.com/b.jpg"]


def test_strip_removes_only_the_photo_line():
    stripped = article_photo.strip_photo_lines(ARTICLE)
    assert "사진:" not in stripped
    assert "URL: https://www.sedaily.com/article/20000001\n\n본문 첫 문단입니다." in stripped
    assert "112만 원" in stripped  # 본문 속 '사진' 낱말·숫자는 그대로


def test_strip_is_a_no_op_for_old_article_files():
    old = "제목: 예전 기사\n기자: 홍길동\nURL: https://www.sedaily.com/article/1\n\n본문"
    assert article_photo.strip_photo_lines(old) == old
