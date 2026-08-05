"""drivers 4개 라우트의 현재 응답을 박제한다 (characterization).

Run from service/backend/::

    python3 -m pytest admin/tests/test_drivers_routes.py -v
"""
from __future__ import annotations

import json

import pytest

from conftest import FakeEB, FakeTable, assert_no_cors

from routes import drivers
from shared import ddb_client


@pytest.fixture
def wired(monkeypatch) -> tuple[FakeTable, FakeEB]:
    table = FakeTable(items=[
        {"pk": "CONFIG", "sk": "feature-flag/v2-selector", "value": {"enabled": True}},
        {"pk": "CONFIG", "sk": "threshold/max-articles", "value": {"threshold": 30}},
    ])
    eb = FakeEB(rules=[{"name": "sedaily-mbti-v2-selector-trigger", "state": "ENABLED",
                        "schedule": "rate(1 hour)", "preset": "1h"}])
    monkeypatch.setattr(ddb_client, "config_table", lambda: table)
    monkeypatch.setattr(drivers.eb_client, "list_rules", eb.list_rules)
    monkeypatch.setattr(drivers.eb_client, "enable_rule", eb.enable_rule)
    monkeypatch.setattr(drivers.eb_client, "disable_rule", eb.disable_rule)
    monkeypatch.setattr(drivers.eb_client, "set_schedule", eb.set_schedule)
    monkeypatch.setattr(drivers.eb_client, "describe_rule", eb.describe_rule)
    return table, eb


def test_list_returns_rules_flags_thresholds(wired) -> None:
    resp = drivers.handle_list({}, {}, {})
    assert resp["statusCode"] == 200
    body = json.loads(resp["body"])
    assert set(body) == {"rules", "feature_flags", "thresholds"}
    assert body["feature_flags"] == {"v2-selector": True}
    assert body["thresholds"] == {"max-articles": 30}
    assert_no_cors(resp)


def test_update_requires_driver_id(wired) -> None:
    resp = drivers.handle_update({"action": "enable"}, {}, {})
    assert resp["statusCode"] == 400
    assert json.loads(resp["body"])["error"] == "driver id required"
    assert_no_cors(resp)


def test_update_rejects_foreign_prefix(wired) -> None:
    resp = drivers.handle_update({"action": "enable"}, {"id": "other-rule"}, {})
    assert resp["statusCode"] == 400
    assert "sedaily-mbti-" in json.loads(resp["body"])["error"]
    assert_no_cors(resp)


def test_update_rejects_unknown_action(wired) -> None:
    resp = drivers.handle_update({"action": "nuke"}, {"id": "sedaily-mbti-x"}, {})
    assert resp["statusCode"] == 400
    assert json.loads(resp["body"])["error"] == "action must be one of: enable, disable, set-cron"
    assert_no_cors(resp)


def test_update_enable_returns_ok_and_rule(wired) -> None:
    _, eb = wired
    resp = drivers.handle_update({"action": "enable"}, {"id": "sedaily-mbti-x"}, {})
    assert resp["statusCode"] == 200
    body = json.loads(resp["body"])
    assert body["ok"] is True
    assert set(body) == {"ok", "rule"}
    assert eb.enabled == ["sedaily-mbti-x"]
    assert_no_cors(resp)


def test_update_writes_audit_row(wired) -> None:
    """drivers.handle_update 은 auth.audit_log 가 아니라 audit.log 를 직접 부른다 —
    죽은 monkeypatch 스텁이 가리던 경로라 이관 후 무단언이었다 (리뷰 지적)."""
    table, _ = wired
    drivers.handle_update({"action": "enable"}, {"id": "sedaily-mbti-x"}, {})
    assert table.put_calls[0]["action"] == "driver-update"


def test_update_set_cron_rejects_unknown_preset(wired) -> None:
    resp = drivers.handle_update(
        {"action": "set-cron", "cron_preset": "99y"}, {"id": "sedaily-mbti-x"}, {})
    assert resp["statusCode"] == 400
    assert "cron_preset must be one of" in json.loads(resp["body"])["error"]
    assert_no_cors(resp)


def test_feature_flag_requires_name(wired) -> None:
    resp = drivers.handle_feature_flag_update({"action": "enable"}, {}, {})
    assert resp["statusCode"] == 400
    assert json.loads(resp["body"])["error"] == "flag name required"
    assert_no_cors(resp)


def test_feature_flag_rejects_unknown_action(wired) -> None:
    resp = drivers.handle_feature_flag_update({"action": "toggle"}, {"name": "f"}, {})
    assert resp["statusCode"] == 400
    assert json.loads(resp["body"])["error"] == "action must be one of: enable, disable"
    assert_no_cors(resp)


def test_feature_flag_enable_writes_and_returns_shape(wired) -> None:
    table, _ = wired
    resp = drivers.handle_feature_flag_update({"action": "enable"}, {"name": "f"}, {})
    assert resp["statusCode"] == 200
    body = json.loads(resp["body"])
    assert set(body) == {"flag", "enabled", "updated_at"}
    assert body["flag"] == "f" and body["enabled"] is True
    assert len(table.update_calls) == 1
    assert_no_cors(resp)


def test_threshold_requires_name(wired) -> None:
    resp = drivers.handle_threshold_update({"value": 5}, {}, {})
    assert resp["statusCode"] == 400
    assert json.loads(resp["body"])["error"] == "threshold name required"
    assert_no_cors(resp)


def test_threshold_rejects_non_integer(wired) -> None:
    resp = drivers.handle_threshold_update({"value": "abc"}, {"name": "t"}, {})
    assert resp["statusCode"] == 400
    assert json.loads(resp["body"])["error"] == "value must be integer"
    assert_no_cors(resp)


@pytest.mark.parametrize("value", [0, 10001])
def test_threshold_enforces_range(wired, value: int) -> None:
    resp = drivers.handle_threshold_update({"value": value}, {"name": "t"}, {})
    assert resp["statusCode"] == 400
    assert json.loads(resp["body"])["error"] == "value out of range (1..10000)"
    assert_no_cors(resp)


def test_threshold_success_returns_shape(wired) -> None:
    resp = drivers.handle_threshold_update({"value": 30}, {"name": "t"}, {})
    assert resp["statusCode"] == 200
    body = json.loads(resp["body"])
    assert set(body) == {"threshold", "value", "updated_at"}
    assert body["value"] == 30
    assert_no_cors(resp)
