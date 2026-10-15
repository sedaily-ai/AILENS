"""온보딩 선택 집계(v1.55) 저장소 규칙을 DB 없이 확인한다(가짜 db 모듈)."""
import contextlib
import sys
import types
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
STATE: dict = {}


class FakeCursor:
    def execute(self, sql, params=None):
        STATE.setdefault("sql", []).append((" ".join(sql.split()), params))

    def fetchall(self):
        return STATE.get("rows", [])


@contextlib.contextmanager
def _cursor():
    yield FakeCursor()


def _repo(monkeypatch, rows=None):
    monkeypatch.setenv("VOTE_HASH_SALT", "s")
    sys.modules["db"] = types.SimpleNamespace(get_cursor=_cursor)
    sys.modules.pop("onboarding_repo", None)
    import onboarding_repo
    STATE.clear()
    STATE["rows"] = rows or []
    return onboarding_repo


def test_rejects_unknown_choice_and_missing_device(monkeypatch):
    r = _repo(monkeypatch)
    with pytest.raises(Exception):
        r.record("device", "night", "text")
    with pytest.raises(Exception):
        r.record("device", "lunch", "numbers")
    with pytest.raises(Exception):
        r.record("", "lunch", "text")
    assert "sql" not in STATE


def test_hash_namespace_differs_from_vote_and_interest(monkeypatch):
    r = _repo(monkeypatch)
    import interests_repo
    from issue_letters_rules import voter_hash
    h = r.chooser_hash("device")
    assert len(h) == 64
    assert h not in (voter_hash("device"), interests_repo.reader_hash("device"))


def test_record_upserts_one_row_per_device(monkeypatch):
    r = _repo(monkeypatch)
    r.record("device", "walk", "sound")
    sql, params = STATE["sql"][0]
    assert "ON CONFLICT (voter_hash) DO UPDATE" in sql
    assert params[1:] == ("walk", "sound")


def test_hides_counts_below_min_sample(monkeypatch):
    r = _repo(monkeypatch, [{"moment_id": "lunch", "glance_id": "text", "n": 3}])
    d = r.distribution()
    assert d == {"total": 3, "ready": False, "min_sample": 50, "counts": None}


def test_counts_fill_all_cells_and_ignore_unknown(monkeypatch):
    rows = [
        {"moment_id": "lunch", "glance_id": "text", "n": 30},
        {"moment_id": "bed", "glance_id": "video", "n": 25},
        {"moment_id": "old", "glance_id": "text", "n": 99},
    ]
    r = _repo(monkeypatch, rows)
    d = r.distribution()
    assert d["ready"] is True and d["total"] == 55
    assert d["counts"]["lunch"]["text"] == 30
    assert d["counts"]["bed"]["video"] == 25
    assert d["counts"]["walk"] == {"text": 0, "comic": 0, "sound": 0, "video": 0}
