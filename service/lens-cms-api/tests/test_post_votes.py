"""1기사 레터 투표(v1.46) 저장소 규칙을 DB 없이 확인한다(가짜 db 모듈)."""
import contextlib
import sys
import types
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
STATE: dict = {}


class FakeCursor:
    def execute(self, sql, params=None):
        STATE["last"] = " ".join(sql.split())
        STATE.setdefault("sql", []).append((STATE["last"], params))

    def fetchone(self):
        last = STATE["last"]
        if "FROM publications" in last:
            return {"?column?": 1} if STATE.get("published", True) else None
        if "ON CONFLICT (slug, voter_hash) DO NOTHING" in last:
            return {"option_key": "o2"} if STATE.get("fresh", True) else None
        if "SELECT option_key FROM post_votes WHERE slug = %s AND voter_hash = %s" in last:
            return {"option_key": "o2"} if STATE.get("voted", True) else None
        return None

    def fetchall(self):
        return [{"option_key": "o1", "n": 3}, {"option_key": "o2", "n": 5}]


@contextlib.contextmanager
def _cursor():
    yield FakeCursor()


def _repo(monkeypatch):
    monkeypatch.setenv("VOTE_HASH_SALT", "s")
    sys.modules["db"] = types.SimpleNamespace(get_cursor=_cursor)
    for m in ("issue_letters_repo", "post_votes_repo"):
        sys.modules.pop(m, None)
    import post_votes_repo
    STATE.clear()
    return post_votes_repo


def test_rejects_unknown_option_key_and_unpublished_post(monkeypatch):
    r = _repo(monkeypatch)
    with pytest.raises(Exception):
        r.vote("s", "voter", "o10")
    with pytest.raises(Exception):
        r.vote("s", "voter", "send")
    STATE["published"] = False
    with pytest.raises(Exception) as e:
        r.vote("s", "voter", "o1")
    assert "404" in str(getattr(e.value, "status", "")) or "투표할 수 없는" in str(e.value)


def test_vote_is_fresh_once_then_returns_existing_choice(monkeypatch):
    r = _repo(monkeypatch)
    res, fresh = r.vote("s", "voter", "o2")
    assert fresh and res["my_choice"] == "o2" and res["counts"] == {"o1": 3, "o2": 5}
    STATE["fresh"] = False
    res2, fresh2 = r.vote("s", "voter", "o1")
    assert not fresh2 and res2["my_choice"] == "o2"


def test_my_vote_hides_counts_until_voted(monkeypatch):
    r = _repo(monkeypatch)
    STATE["voted"] = False
    assert r.my_vote("s", "voter") == {"my_choice": None, "counts": None}
    STATE["voted"] = True
    assert r.my_vote("s", "voter")["counts"] == {"o1": 3, "o2": 5}
