"""admin_posts_repo / cms_posts_repo / cms_posts_shaping 의 순수 함수 특성화 테스트(2026-10-12 리팩토링 전 동작 고정)."""
import sys
from pathlib import Path
from unittest.mock import MagicMock

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
sys.modules.setdefault("db", MagicMock())  # 임포트 시 DB 풀을 만들지 않게 한다

import admin_posts_repo as admin_repo  # noqa: E402
import cms_posts_repo as cms_repo  # noqa: E402
import cms_posts_shaping as shaping  # noqa: E402


def test_slugify_strips_symbols_and_prefixes_date():
    assert admin_repo.slugify("2026-10-12", "[단독]MZ 성지 ‘힙성수’의 민낯…임금체불 신고 136% 급증") == "2026-10-12-단독-MZ-성지-힙성수-의-민낯-임금체불-신고-136-급증"


def test_slugify_empty_headline_is_date_only():
    assert admin_repo.slugify("2026-10-12", "") == "2026-10-12"
    assert admin_repo.slugify("2026-10-12", None) == "2026-10-12"


def test_slugify_caps_length_at_80():
    assert len(admin_repo.slugify("2026-10-12", "가" * 200)) == 80


def _post():
    return {"slug": "s1", "headline": "H", "subtitle": "S", "published_at": "x", "cover_image_url": None,
            "body_inline": {"body": ["a", "", "b"], "images": [{"url": "u1"}, {"url": None}, None]}}


def test_body_paragraphs_drops_empty():
    assert shaping._body_paragraphs(_post()) == ["a", "b"]


def test_shape_paper_blocks_and_content():
    out = shaping.shape_paper(_post())
    assert out["news_id"] == "s1" and out["title"] == "H" and out["sub_title"] == "S"
    assert out["content"] == "a\n\nb"
    assert out["content_blocks"] == [{"type": "text", "text_ko": "a"}, {"type": "text", "text_ko": "b"}, {"type": "image", "url": "u1"}]
    assert out["is_cms"] is True and out["is_top"] is False


def test_shape_letter_has_contract_keys():
    keys = set(shaping.shape_letter({"slug": "s", "body_inline": {}}).keys())
    assert {"id", "editor_id", "headline", "body", "key_points", "category", "subcategory", "is_cms"} <= keys


def test_lens_extra_by_label_skips_unlabeled():
    extra = {"body_inline": {"lenses": [{"label": "레터", "x": 1}, {"label": None}, {"label": "영상"}]}}
    assert cms_repo._lens_extra_by_label(extra) == {"레터": {"label": "레터", "x": 1}, "영상": {"label": "영상"}}
    assert cms_repo._lens_extra_by_label(None) == {}


def test_apply_admin_extra_merges_common_meta():
    p = {"body_inline": {}}
    cms_repo._apply_admin_extra(p, {"body_inline": {"category": "금융", "subcategory": "은행"}, "display_order": 3, "editor_id": "e"})
    assert p["body_inline"]["category"] == "금융" and p["body_inline"]["subcategory"] == "은행"
    assert p["display_order"] == 3 and p["editor_id"] == "e"


def test_apply_admin_extra_none_fills_nulls():
    p = {"body_inline": {}}
    cms_repo._apply_admin_extra(p, None)
    assert p["body_inline"] == {"category": None, "subcategory": None, "paper_section": None, "photo_image_url": None}
    assert p["display_order"] is None and p["editor_id"] is None
