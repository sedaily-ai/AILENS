"""prism_auto._article_block — 기사 txt에 보도사진 주소를 넣는지(2026-11-23).

이 줄이 있어야 prism_batch가 유튜브 썸네일 배경으로 기사 사진을 쓸 수 있다. 사진이 없는 기사는 줄이 없다.
"""
import sys
import xml.etree.ElementTree as ET
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "common"))
sys.path.insert(0, str(Path(__file__).parent))

import article_photo  # noqa: E402
import prism_auto  # noqa: E402

_ITEM = """<item>
  <key>20000001</key>
  <title>Memory prices slide</title>
  <author>홍길동</author>
  <date>2026-11-17</date>
  <time>10:00</time>
  <content>본문 첫 문단입니다.</content>
  <category name="경제"/>
  {image}
  <url href="https://www.sedaily.com/article/20000001"/>
</item>"""


def _block(image: str = '<image href="https://wimg.sedaily.com/NewsImg/2026/11/17/ABC123_P1.jpg"/>') -> str:
    return prism_auto._article_block(ET.fromstring(_ITEM.format(image=image)))


def test_block_carries_photo_line():
    block = _block()
    assert "사진: https://wimg.sedaily.com/NewsImg/2026/11/17/ABC123_P1.jpg\n" in block
    assert article_photo.primary_photo_url(block) == "https://wimg.sedaily.com/NewsImg/2026/11/17/ABC123_P1.jpg"


def test_block_without_photo_has_no_photo_line():
    block = _block(image="")
    assert "사진:" not in block
    assert article_photo.primary_photo_url(block) is None


def test_photo_line_does_not_change_the_rest_of_the_block():
    block = _block()
    assert block.startswith("제목: Memory prices slide\n")
    assert "URL: https://www.sedaily.com/article/20000001\n사진: https://wimg.sedaily.com/NewsImg/2026/11/17/ABC123_P1.jpg\n\n본문 첫 문단입니다." in block
