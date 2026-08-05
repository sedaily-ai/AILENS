"""audit 모듈 — 컨텍스트 바인딩 · sk 충돌 회피 · fail-open.

Run from service/backend/::

    python3 -m pytest admin/tests/test_audit.py -v
"""
from __future__ import annotations

import pytest

from conftest import FakeTable

from shared import audit, ddb_client


@pytest.fixture(autouse=True)
def _clean() -> None:
    audit.reset_context()
    yield
    audit.reset_context()


@pytest.fixture
def table(monkeypatch) -> FakeTable:
    t = FakeTable()
    monkeypatch.setattr(ddb_client, "config_table", lambda: t)
    return t


def test_log_writes_audit_row_with_required_keys(table) -> None:
    audit.log("post-publish", {"id": "abc"})
    assert len(table.put_calls) == 1
    item = table.put_calls[0]
    assert item["pk"] == "AUDIT"
    assert item["action"] == "post-publish"
    assert item["actor"] == "admin"
    assert item["detail"] == {"id": "abc"}


def test_sk_carries_random_suffix_after_iso_timestamp(table) -> None:
    audit.log("a")
    audit.log("b")
    sk_a, sk_b = table.put_calls[0]["sk"], table.put_calls[1]["sk"]
    for sk in (sk_a, sk_b):
        stamp, _, suffix = sk.partition("#")
        assert stamp.endswith("Z")
        assert len(suffix) == 4
        int(suffix, 16)          # hex 로 파싱되지 않으면 여기서 ValueError
    assert sk_a != sk_b


def test_sk_sorts_chronologically_against_legacy_rows(table) -> None:
    """ISO 접두가 정렬을 지배한다 — 접미 없는 기존 행과 섞여도 시간순이 보존된다.

    하드코딩한 문자열 둘을 비교하면 sk 생성 로직이 어떻게 망가져도(접미를 앞에
    붙이거나 타임스탬프 포맷을 바꿔도) 통과한다. 실제 audit.log() 가 만든 sk 로
    판정해야 회귀를 잡는다.
    """
    audit.log("a")
    new_sk = table.put_calls[0]["sk"]
    stamp = new_sk.split("#")[0]

    assert "2026-01-01T00:00:00.000000Z" < new_sk    # 과거의 접미 없는 행이 앞
    assert new_sk < "2099-01-01T00:00:00.000000Z"    # 미래의 접미 없는 행이 뒤
    # 타임스탬프가 같으면 접미 없는 쪽(짧은 문자열)이 먼저다 — 덮어쓰기가 아니라 공존.
    assert stamp < new_sk


def test_bind_context_is_merged_into_row(table) -> None:
    audit.bind_context(session="2026-07-29T04:00:00Z", source_ip="203.0.113.7")
    audit.log("driver-update")
    item = table.put_calls[0]
    assert item["session"] == "2026-07-29T04:00:00Z"
    assert item["source_ip"] == "203.0.113.7"


def test_unbound_context_omits_optional_keys(table) -> None:
    audit.log("driver-update")
    item = table.put_calls[0]
    assert "session" not in item
    assert "source_ip" not in item


def test_log_is_fail_open_when_ddb_raises(monkeypatch) -> None:
    """감사 실패가 주 흐름을 막으면 안 된다 — raise 하지 않는다."""
    def boom():
        raise RuntimeError("ddb down")
    monkeypatch.setattr(ddb_client, "config_table", boom)
    audit.log("post-delete", {"id": "x"})   # 예외가 새어 나오면 실패


def test_reset_context_clears_previous_binding(table) -> None:
    audit.bind_context(session="s1", source_ip="1.1.1.1")
    audit.reset_context()
    audit.log("x")
    assert "session" not in table.put_calls[0]
