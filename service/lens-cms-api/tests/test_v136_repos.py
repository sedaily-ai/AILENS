"""v1.36 신규 저장소(candidate_seen/admin_jobs/daily_questions)의 입력 검증과 SQL 호출 형태를 DB 없이 확인한다.

db 모듈은 import 시 실제 커넥션 풀을 만들므로, 가짜 `db.get_cursor`로 대체한 뒤 저장소를 불러온다.
실제 DB 동작(UPSERT·제약)은 DDL 적용 뒤 스모크 검증(v1.36 문서 "검증")에서 확인한다.
"""
import contextlib
import datetime
import sys
import types
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

CALLS: list = []


class FakeCursor:
    rowcount = 1

    def __init__(self):
        self._row = None

    def execute(self, sql, params=None):
        CALLS.append((" ".join(sql.split()), params))
        self._row = None
        if "RETURNING seen_at" in sql:
            self._row = {"seen_at": datetime.datetime(2026, 10, 9)}
        elif "SELECT article_key" in sql:
            self._row = [{"article_key": "a1"}]
        elif "INSERT INTO admin_jobs" in sql:
            now = datetime.datetime(2026, 10, 9)
            self._row = {"kind": "k", "job_id": "j", "status": "pending", "payload": {}, "result": {}, "error": None,
                         "created_at": now, "updated_at": now, "finished_at": None}
        elif "SELECT question_date" in sql:
            self._row = {"question_date": datetime.date(2026, 10, 9), "questions": [1], "question_count": 1, "model": None,
                         "generated_at": datetime.datetime(2026, 10, 9)}

    def fetchone(self):
        return self._row

    def fetchall(self):
        return self._row


@contextlib.contextmanager
def _fake_get_cursor():
    yield FakeCursor()


@pytest.fixture(autouse=True)
def stub_db(monkeypatch):
    CALLS.clear()
    module = types.ModuleType("db")
    module.get_cursor = _fake_get_cursor
    monkeypatch.setitem(sys.modules, "db", module)
    for name in ("candidate_seen_repo", "admin_jobs_repo", "daily_questions_repo"):
        monkeypatch.delitem(sys.modules, name, raising=False)


def test_candidate_seen_exists_and_mark():
    import candidate_seen_repo as c

    assert c.exists_keys("mustknow", ["a1", "a2"]) == ["a1"]
    assert c.exists_keys("mustknow", []) == []
    assert c.mark_seen("mustknow", "a1", score=7.5)["seen_at"].startswith("2026-10-09")
    assert any("ON CONFLICT (pipeline, article_key) DO UPDATE" in sql for sql, _ in CALLS)


def test_candidate_seen_bulk_is_dry_run_by_default_and_idempotent():
    import candidate_seen_repo as c

    item = {"pipeline": "mustknow", "article_key": "x", "seen_at": "2026-10-01T00:00:00Z"}
    assert c.bulk_import([item]) == {"dry_run": True, "count": 1}
    assert not any("INSERT" in sql for sql, _ in CALLS)
    c.bulk_import([item], dry_run=False)
    assert any("ON CONFLICT (pipeline, article_key) DO NOTHING" in sql for sql, _ in CALLS)


@pytest.mark.parametrize("call", [
    lambda c, a, d: c.exists_keys("", ["a"]),
    lambda c, a, d: c.mark_seen("p", "x" * 65),
    lambda c, a, d: c.bulk_import([]),
    lambda c, a, d: a.create_job("Bad Kind", "j"),
    lambda c, a, d: a.create_job("k", "bad id"),
    lambda c, a, d: a.update_job("k", "j", status="nope"),
    lambda c, a, d: d.get_questions("2026/10/09"),
    lambda c, a, d: d.save_questions("2026-10-09", []),
])
def test_input_validation(call):
    import admin_jobs_repo as a
    import candidate_seen_repo as c
    import daily_questions_repo as d

    with pytest.raises(ValueError):
        call(c, a, d)


def test_admin_jobs_create_purges_expired_and_is_pending():
    import admin_jobs_repo as a

    job = a.create_job("webtoon_cut", "j1", {"cut": 1})
    assert job["status"] == "pending"
    assert any("DELETE FROM admin_jobs WHERE expires_at < now()" in sql for sql, _ in CALLS)


def test_daily_questions_first_write_wins():
    import daily_questions_repo as d

    saved = d.save_questions("2026-10-09", [{"q": 1}])
    assert saved["question_count"] == 1
    assert any("ON CONFLICT (question_date) DO NOTHING" in sql for sql, _ in CALLS)
