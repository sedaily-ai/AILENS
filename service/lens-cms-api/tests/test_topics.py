"""주제 사전(topics_repo): 항목 검증, 이름·별칭 충돌 검사, 태그 해석을 DB 없이 확인한다."""
import contextlib
import sys
import types
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))


@pytest.fixture(autouse=True)
def stub_db(monkeypatch):
    module = types.ModuleType("db")
    module.get_cursor = contextlib.nullcontext
    monkeypatch.setitem(sys.modules, "db", module)
    monkeypatch.delitem(sys.modules, "topics_repo", raising=False)


def _t():
    import topics_repo
    return topics_repo


def item(**over):
    base = {"slug": "rates", "name": "금리", "kind": "topic", "category_slug": "finance", "aliases": ["기준금리", "금리 인상"]}
    base.update(over)
    return base


def test_validate_item_ok_and_defaults():
    v = _t().validate_item({"slug": "fx", "name": "환율"})
    assert v["kind"] == "topic" and v["aliases"] == [] and v["category_slug"] is None and v["is_active"] is True


@pytest.mark.parametrize("bad", [
    item(slug="Bad Slug"), item(slug="a"), item(name=""), item(name="가" * 65), item(kind="thing"),
    item(category_slug="sports"), item(aliases="기준금리"), item(aliases=[""]), item(aliases=["a"] * 13), "x", None,
])
def test_validate_item_rejects(bad):
    with pytest.raises(_t().LetterError):
        _t().validate_item(bad)


def test_norm_ignores_spaces_and_case():
    assert _t().norm(" 금리  인상 ") == _t().norm("금리인상") and _t().norm("ETF") == _t().norm("etf")


def test_conflicts_between_items_and_with_existing():
    t = _t()
    a = t.validate_item(item())
    b = t.validate_item(item(slug="rate-hike", name="금리 인상 전망", aliases=[]))
    assert t.find_conflicts([a], []) == []
    assert t.find_conflicts([a, t.validate_item(item(slug="x1", name="기준금리"))], [])  # 이름이 다른 항목의 별칭과 겹침
    existing = [{"slug": "rates", "name": "금리", "aliases": ["기준금리"]}]
    assert t.find_conflicts([t.validate_item(item(slug="x2", name="기준 금리"))], existing)  # 공백만 달라도 같은 이름
    # 같은 slug 로 덮어쓰는 것은 자기 자신과 겹치지 않는다
    assert t.find_conflicts([a], existing) == []
    assert t.find_conflicts([b], existing) == []


class _Cur:
    def __init__(self, rows):
        self.rows = rows

    def execute(self, sql, params=None):
        pass

    def fetchall(self):
        return self.rows


ROWS = [
    {"id": 1, "slug": "rates", "name": "금리", "kind": "topic", "aliases": ["기준금리", "금리 인상"]},
    {"id": 2, "slug": "samsung-electronics", "name": "삼성전자", "kind": "company", "aliases": ["삼전"]},
]


def test_resolve_by_slug_name_alias_keeps_order_and_dedupes():
    out = _t().resolve_tags(_Cur(ROWS), ["삼전", "기준 금리", "rates", "삼성전자"])
    assert [o["slug"] for o in out] == ["samsung-electronics", "rates"]


def test_resolve_unknown_lists_all_and_hints():
    with pytest.raises(_t().LetterError) as e:
        _t().resolve_tags(_Cur(ROWS), ["금리", "비트코인", "화성"])
    assert "비트코인" in str(e.value) and "화성" in str(e.value) and "사전" in str(e.value)


def test_seed_file_is_valid_and_conflict_free():
    import json
    t = _t()
    items = json.load(open(Path(__file__).resolve().parents[3] / "docs/product/모아쓰기레터/seed/topics_seed.json", encoding="utf-8"))
    clean = [t.validate_item(it, i) for i, it in enumerate(items)]
    assert len(clean) >= 70 and len({c["slug"] for c in clean}) == len(clean)
    assert t.find_conflicts(clean, []) == []
