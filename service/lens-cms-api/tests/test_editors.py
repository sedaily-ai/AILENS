"""레터 에디터(editors_repo): 입력 검증과 slug 규칙을 DB 없이 확인한다."""
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
    monkeypatch.delitem(sys.modules, "editors_repo", raising=False)


def _m():
    import editors_repo
    return editors_repo


GOOD = {"slug": "mincheol", "name": "민철", "role": "전략 분석 에디터", "intro": "소개", "persona_group": "NT", "image_url": "/editors/intj.webp"}


def test_validate_editor_accepts_good_input_and_normalizes():
    m = _m()
    out = m.validate_editor({**GOOD, "mbti": "intj", "nickname": " 분석가 "})
    assert out["slug"] == "mincheol" and out["mbti"] == "INTJ" and out["nickname"] == "분석가" and out["is_active"] is True


@pytest.mark.parametrize("bad", [
    {**GOOD, "slug": "Bad Slug"}, {**GOOD, "slug": ""}, {**GOOD, "slug": "x" * 33},
    {**GOOD, "name": ""}, {**GOOD, "role": "r" * 65}, {**GOOD, "intro": ""},
    {**GOOD, "persona_group": "XX"}, {**GOOD, "image_url": "http://evil.example/a.png"}, {**GOOD, "voice_url": "relative.mp3"},
])
def test_validate_editor_rejects_bad_input(bad):
    m = _m()
    with pytest.raises(m.LetterError):
        m.validate_editor(bad)


def test_upsert_rejects_empty_duplicate_and_oversize():
    m = _m()
    with pytest.raises(m.LetterError):
        m.upsert_editors([])
    with pytest.raises(m.LetterError):
        m.upsert_editors([GOOD, GOOD])  # 같은 slug
    with pytest.raises(m.LetterError):
        m.upsert_editors([{**GOOD, "slug": f"e{i}"} for i in range(51)])
    with pytest.raises(m.LetterError):
        m.upsert_editors("not a list")
