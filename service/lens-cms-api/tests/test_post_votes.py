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
        if "ON CONFLICT (slug, voter_hash) DO UPDATE" in last:
            return {"option_key": "o2"}
        if "SELECT option_key FROM post_votes WHERE slug = %s AND voter_hash = %s" in last:
            return {"option_key": STATE["had"]} if STATE.get("had") else None
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


def test_vote_first_same_and_change(monkeypatch):
    r = _repo(monkeypatch)
    res, changed = r.vote("s", "voter", "o2")
    assert changed and res["my_choice"] == "o2" and res["counts"] == {"o1": 3, "o2": 5}
    STATE["had"] = "o2"
    _, same = r.vote("s", "voter", "o2")  # 같은 보기를 다시 눌러도 달라진 게 없다
    assert not same
    STATE["had"] = "o1"
    res3, changed3 = r.vote("s", "voter", "o2")  # 보기를 바꿈
    assert changed3 and res3["my_choice"] == "o2"
    sql = " ".join(q for q, _ in STATE["sql"])
    assert "DO UPDATE SET option_key = EXCLUDED.option_key" in sql


def test_my_vote_hides_counts_until_voted(monkeypatch):
    r = _repo(monkeypatch)
    assert r.my_vote("s", "voter") == {"my_choice": None, "counts": None}
    STATE["had"] = "o2"
    assert r.my_vote("s", "voter")["counts"] == {"o1": 3, "o2": 5}
