"""drivers 4개 라우트의 현재 응답을 박제한다 (characterization).

2026-09-09(v1.28): feature flag/threshold 저장이 DynamoDB에서
PostgreSQL(lens-cms-api, repo/config_repo.py 경유)로 바뀌면서 FakeTable
기반 config_table() monkeypatch를 config_repo 함수 스텁으로 다시 썼다.
EventBridge rule 제어(eb_client)는 AWS 리소스 자체 상태라 이번 전환과
무관 — FakeEB는 그대로 유지.

Run from admin/backend/::

    python3 -m pytest tests/test_drivers_routes.py -v
"""
from __future__ import annotations

import json

import pytest

from conftest import FakeEB, assert_no_cors

from routes import drivers


@pytest.fixture
def wired(monkeypatch) -> tuple[list, FakeEB]:
    audit_calls: list = []
    eb = FakeEB(rules=[{"name": "sedaily-mbti-v2-selector-trigger", "state": "ENABLED",
                        "schedule": "rate(1 hour)", "preset": "1h"}])
    monkeypatch.setattr(drivers.config_repo, "list_feature_flags", lambda: {"v2-selector": True})
    monkeypatch.setattr(drivers.config_repo, "list_thresholds", lambda: {"max-articles": 30})
    monkeypatch.setattr(drivers.config_repo, "set_feature_flag", lambda name, enabled: "2026-09-09T00:00:00Z")
    monkeypatch.setattr(drivers.config_repo, "set_threshold", lambda name, value: "2026-09-09T00:00:00Z")
    monkeypatch.setattr(drivers.eb_client, "list_rules", eb.list_rules)
    monkeypatch.setattr(drivers.eb_client, "enable_rule", eb.enable_rule)
    monkeypatch.setattr(drivers.eb_client, "disable_rule", eb.disable_rule)
    monkeypatch.setattr(drivers.eb_client, "set_schedule", eb.set_schedule)
    monkeypatch.setattr(drivers.eb_client, "describe_rule", eb.describe_rule)

    def fake_log_event(action, detail, actor, session, source_ip):
        audit_calls.append({"action": action, "detail": detail, "actor": actor})

    monkeypatch.setattr(drivers.audit.audit_repo, "log_event", fake_log_event)
    return audit_calls, eb


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
    audit_calls, _ = wired
    drivers.handle_update({"action": "enable"}, {"id": "sedaily-mbti-x"}, {})
    assert audit_calls[0]["action"] == "driver-update"


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


def test_feature_flag_enable_writes_and_returns_shape(monkeypatch, wired) -> None:
    calls = []
    monkeypatch.setattr(drivers.config_repo, "set_feature_flag",
                        lambda name, enabled: calls.append((name, enabled)) or "2026-09-09T00:00:00Z")
    resp = drivers.handle_feature_flag_update({"action": "enable"}, {"name": "f"}, {})
    assert resp["statusCode"] == 200
    body = json.loads(resp["body"])
    assert set(body) == {"flag", "enabled", "updated_at"}
    assert body["flag"] == "f" and body["enabled"] is True
    assert calls == [("f", True)]
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
