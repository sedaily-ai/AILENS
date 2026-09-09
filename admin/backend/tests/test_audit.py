"""audit 모듈 — 컨텍스트 바인딩 · fail-open.

2026-09-09(v1.27): 저장이 DynamoDB(pk='AUDIT', sk='ISO(ms)#hex')에서
PostgreSQL(lens-cms-api, repo/audit_repo.py 경유, BIGSERIAL id)로 바뀌면서
sk 충돌 회피/정렬 관련 테스트 2개를 뺐다 — 둘 다 DynamoDB의 flat pk/sk
설계가 만드는 "같은 ms에 두 건이면 덮어써진다" 문제를 막던 것인데,
BIGSERIAL PK는 그 문제 자체가 구조적으로 없다.

Run from admin/backend/::

    python3 -m pytest tests/test_audit.py -v
"""
from __future__ import annotations

import pytest

from shared import audit


@pytest.fixture(autouse=True)
def _clean() -> None:
    audit.reset_context()
    yield
    audit.reset_context()


@pytest.fixture
def calls(monkeypatch) -> list:
    log: list = []

    def fake_log_event(action, detail, actor, session, source_ip):
        log.append({
            "action": action, "detail": detail, "actor": actor,
            "session": session, "source_ip": source_ip,
        })

    monkeypatch.setattr(audit.audit_repo, "log_event", fake_log_event)
    return log


def test_log_writes_audit_row_with_required_keys(calls) -> None:
    audit.log("post-publish", {"id": "abc"})
    assert len(calls) == 1
    item = calls[0]
    assert item["action"] == "post-publish"
    assert item["actor"] == "admin"
    assert item["detail"] == {"id": "abc"}


def test_bind_context_is_merged_into_row(calls) -> None:
    audit.bind_context(session="2026-07-29T04:00:00Z", source_ip="203.0.113.7")
    audit.log("driver-update")
    item = calls[0]
    assert item["session"] == "2026-07-29T04:00:00Z"
    assert item["source_ip"] == "203.0.113.7"


def test_unbound_context_omits_optional_keys(calls) -> None:
    audit.log("driver-update")
    item = calls[0]
    assert item["session"] is None
    assert item["source_ip"] is None


def test_log_is_fail_open_when_backend_raises(monkeypatch) -> None:
    """감사 실패가 주 흐름을 막으면 안 된다 — raise 하지 않는다."""
    def boom(*args, **kwargs):
        raise RuntimeError("lens-cms-api down")
    monkeypatch.setattr(audit.audit_repo, "log_event", boom)
    audit.log("post-delete", {"id": "x"})   # 예외가 새어 나오면 실패


def test_reset_context_clears_previous_binding(calls) -> None:
    audit.bind_context(session="s1", source_ip="1.1.1.1")
    audit.reset_context()
    audit.log("x")
    assert calls[0]["session"] is None
