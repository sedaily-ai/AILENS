"""slugify 유닛 테스트. DB·AWS 불필요.

Run from service/backend/::

    python3 -m pytest admin/tests/test_slug.py -v
"""
from __future__ import annotations

import sys
from pathlib import Path

# admin Lambda 는 zip 루트가 admin/ 이라 flat import 를 쓴다. 테스트도 같은 경로 규약을 맞춘다.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from shared.slug import slugify


def test_slugify_joins_date_and_headline() -> None:
    assert slugify("2026-07-27", "오늘의 소식") == "2026-07-27-오늘의-소식"


def test_slugify_replaces_special_chars_with_single_dash() -> None:
    assert slugify("2026-07-27", "AI, 그리고  미래!") == "2026-07-27-AI-그리고-미래"


def test_slugify_strips_trailing_dash() -> None:
    assert slugify("2026-07-27", "제목???") == "2026-07-27-제목"


def test_slugify_truncates_to_80_chars() -> None:
    out = slugify("2026-07-27", "가" * 200)
    assert len(out) == 80
    assert not out.endswith("-")


def test_slugify_handles_empty_headline() -> None:
    assert slugify("2026-07-27", "   ") == "2026-07-27"
