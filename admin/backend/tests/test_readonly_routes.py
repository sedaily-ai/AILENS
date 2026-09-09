"""cost · audit · newsletter 의 현재 응답을 박제한다 (characterization).

Run from service/backend/::

    python3 -m pytest admin/tests/test_readonly_routes.py -v
"""
from __future__ import annotations

import json

import pytest

from conftest import assert_no_cors

from routes import audit as audit_route

_AUDITS = [
    {"ts": "2026-07-29T05:00:00.000000Z", "action": "login-success",
     "actor": "admin", "detail": None, "session": "2026-07-29T04:00:00Z", "source_ip": "203.0.113.7"},
    {"ts": "2026-07-29T04:00:00.000000Z", "action": "prompt-update",
     "actor": "admin", "detail": {"prompt": "transform/nt"}, "session": None, "source_ip": None},
]


@pytest.fixture
def wired(monkeypatch) -> list:
    """audit_repo.list_events 호출을 기록하고 _AUDITS를 그대로 돌려준다.

    2026-09-09(v1.27): 저장이 PostgreSQL(lens-cms-api, id 내림차순 keyset
    페이지네이션)로 바뀌면서 커서 포맷이 base64-JSON에서 단순 정수 문자열
    (audit_logs.id)로 바뀌었다 — FakeTable 기반 DynamoDB 커서 테스트는
    전부 이 새 계약으로 다시 썼다.
    """
    calls: list = []

    def fake_list_events(limit, cursor):
        calls.append({"limit": limit, "cursor": cursor})
        return _AUDITS, None

    monkeypatch.setattr(audit_route.audit_repo, "list_events", fake_list_events)
    return calls


def test_audit_default_limit_and_shape(wired) -> None:
    resp = audit_route.handle_list({}, {}, {})
    assert resp["statusCode"] == 200
    body = json.loads(resp["body"])
    assert set(body) == {"audits", "count", "next_cursor"}
    assert body["count"] == 2
    assert set(body["audits"][0]) == {"ts", "action", "detail", "actor", "session", "source_ip"}
    assert body["audits"][0]["ts"] == "2026-07-29T05:00:00.000000Z"
    assert body["audits"][0]["session"] == "2026-07-29T04:00:00Z"
    assert body["audits"][0]["source_ip"] == "203.0.113.7"
    assert wired[-1]["limit"] == audit_route.DEFAULT_LIMIT
    assert_no_cors(resp)


def test_audit_rejects_non_integer_limit(wired) -> None:
    resp = audit_route.handle_list({}, {}, {"limit": "abc"})
    assert resp["statusCode"] == 400
    assert json.loads(resp["body"])["error"] == "limit must be integer"
    assert_no_cors(resp)


def test_audit_rejects_non_integer_cursor(wired) -> None:
    """커서는 이제 audit_logs.id(정수 문자열)다 — 숫자가 아니면 400."""
    resp = audit_route.handle_list({}, {}, {"cursor": "not-an-id"})
    assert resp["statusCode"] == 400
    assert json.loads(resp["body"])["error"] == "invalid cursor"
    assert_no_cors(resp)


def test_audit_accepts_well_formed_cursor(wired) -> None:
    resp = audit_route.handle_list({}, {}, {"cursor": "42"})
    assert resp["statusCode"] == 200
    assert wired[-1]["cursor"] == "42"


def test_audit_clamps_limit_to_max(wired) -> None:
    audit_route.handle_list({}, {}, {"limit": "9999"})
    assert wired[-1]["limit"] == audit_route.MAX_LIMIT


def test_audit_clamps_limit_to_min(wired) -> None:
    audit_route.handle_list({}, {}, {"limit": "0"})
    assert wired[-1]["limit"] == 1


def test_audit_returns_null_cursor_when_no_more_pages(wired) -> None:
    resp = audit_route.handle_list({}, {}, {})
    assert json.loads(resp["body"])["next_cursor"] is None


def test_audit_returns_cursor_when_more_pages_exist(monkeypatch) -> None:
    monkeypatch.setattr(audit_route.audit_repo, "list_events", lambda limit, cursor: (_AUDITS, "2"))
    resp = audit_route.handle_list({}, {}, {})
    assert json.loads(resp["body"])["next_cursor"] == "2"


# --------------------------------------------------------------------------- cost

from routes import cost as cost_route


@pytest.fixture
def cw_tokens(monkeypatch) -> None:
    """input 200만 · output 100만.

    두 값을 **다르게** 둬야 입출력이 뒤바뀌는 회귀를 잡는다. 같은 값이면
    cost.py 의 input_per_1m/output_per_1m 이 서로 swap 되거나 어느 합계가
    어느 필드로 가는지가 뒤바뀌어도 결과가 동일해 테스트가 통과한다.
    """
    def _sum(**kwargs) -> float:
        token_type = next(
            d["Value"] for d in kwargs["dimensions"] if d["Name"] == "TokenType"
        )
        return 2_000_000.0 if token_type == "input" else 1_000_000.0

    monkeypatch.setattr(cost_route.cw_client, "get_token_sum", _sum)


def test_cost_summary_top_level_shape(cw_tokens) -> None:
    resp = cost_route.handle_summary({}, {}, {})
    assert resp["statusCode"] == 200
    body = json.loads(resp["body"])
    assert set(body) == {"by_lambda", "total_7d_usd", "note"}
    assert set(body["by_lambda"]) == {"transform-dev"}
    assert_no_cors(resp)


def test_cost_opus_entry_prices_input_and_output(cw_tokens) -> None:
    body = json.loads(cost_route.handle_summary({}, {}, {})["body"])
    entry = body["by_lambda"]["transform-dev"]["opus-4-6"]
    assert entry["input_tokens"] == 2_000_000
    assert entry["output_tokens"] == 1_000_000
    # 2M * $15/1M + 1M * $75/1M = 105.0. 입출력이 뒤바뀌면 165.0 이 되어 실패한다.
    assert entry["cost_usd"] == 105.0


def test_cost_titan_entry_omits_output_tokens(cw_tokens) -> None:
    """has_output=False 인 모델은 output_tokens 키 자체가 없다."""
    body = json.loads(cost_route.handle_summary({}, {}, {})["body"])
    titan = body["by_lambda"]["transform-dev"]["titan-v2"]
    assert "output_tokens" not in titan
    assert titan["input_tokens"] == 2_000_000
    assert titan["cost_usd"] == 0.04


def test_cost_total_sums_all_models(cw_tokens) -> None:
    body = json.loads(cost_route.handle_summary({}, {}, {})["body"])
    assert body["total_7d_usd"] == 105.04


# --------------------------------------------------------------- newsletter

from routes import newsletter as nl_route


def _raising_list_all():
    raise RuntimeError("ddb down")


_SUBS = [
    {"email": "abcd@x.com", "status": "active", "created_at": "2026-07-01"},
    {"email": "ef@y.com", "status": "unsubscribed", "created_at": "2026-06-01"},
]

# 지표마다 값을 다르게 둔다. 전부 같은 값이면 open_rate/click_rate/delivery_rate
# 계산이 서로 뒤바뀌어도 셋 다 같은 수가 나와 회귀를 감지할 수 없다.
_SES = {"Send": 100, "Delivery": 90, "Open": 50, "Click": 10, "Bounce": 5, "Complaint": 2}


def test_newsletter_stats_shape_and_active_count(monkeypatch) -> None:
    # MBTI 페르소나 폐기(2026-08) 이후 by_group 집계는 없다 — 구독자는 그룹을 갖지 않는다.
    monkeypatch.setattr(nl_route.subscribers_repo, "list_all", lambda: list(_SUBS))
    monkeypatch.setattr(nl_route, "_ses_sum", lambda metric, days: 100)

    resp = nl_route.handle_stats({}, {}, {})
    assert resp["statusCode"] == 200
    body = json.loads(resp["body"])
    assert set(body) == {"subscribers", "metrics"}
    subs = body["subscribers"]
    assert set(subs) == {"total", "active", "recent"}
    assert subs["total"] == 2
    assert subs["active"] == 1
    assert_no_cors(resp)


def test_newsletter_masks_recent_emails(monkeypatch) -> None:
    monkeypatch.setattr(nl_route.subscribers_repo, "list_all", lambda: list(_SUBS))
    monkeypatch.setattr(nl_route, "_ses_sum", lambda metric, days: 0)
    body = json.loads(nl_route.handle_stats({}, {}, {})["body"])
    emails = [r["email"] for r in body["subscribers"]["recent"]]
    assert "a**d@x.com" in emails      # local 4자 → 첫·끝 남기고 마스킹
    assert "e*@y.com" in emails        # local 2자 이하 → 첫 글자 + '*'


def test_newsletter_computes_rates_from_ses_sums(monkeypatch) -> None:
    monkeypatch.setattr(nl_route.subscribers_repo, "list_all", lambda: [])
    monkeypatch.setattr(nl_route, "_ses_sum", lambda metric, days: _SES[metric])
    metrics = json.loads(nl_route.handle_stats({}, {}, {})["body"])["metrics"]
    # 셋이 서로 다른 값이라 계산이 뒤바뀌면 반드시 하나 이상 실패한다.
    assert metrics["open_rate"] == 50.0
    assert metrics["click_rate"] == 10.0
    assert metrics["delivery_rate"] == 90.0
    # 응답 스키마에 있으나 비율 계산에는 안 쓰이는 두 지표도 그대로 실려야 한다.
    assert metrics["bounce"] == 5
    assert metrics["complaint"] == 2


def test_newsletter_rates_are_zero_when_no_sends(monkeypatch) -> None:
    """0 나눗셈 방어 — send 가 0이면 세 비율 전부 0.0."""
    monkeypatch.setattr(nl_route.subscribers_repo, "list_all", lambda: [])
    monkeypatch.setattr(nl_route, "_ses_sum", lambda metric, days: 0)
    metrics = json.loads(nl_route.handle_stats({}, {}, {})["body"])["metrics"]
    assert metrics["open_rate"] == 0.0
    assert metrics["click_rate"] == 0.0
    assert metrics["delivery_rate"] == 0.0


@pytest.mark.parametrize("raw,expected", [("0", 1), ("999", 90), ("abc", 7), (None, 7)])
def test_newsletter_clamps_days(monkeypatch, raw, expected: int) -> None:
    monkeypatch.setattr(nl_route.subscribers_repo, "list_all", lambda: [])
    monkeypatch.setattr(nl_route, "_ses_sum", lambda metric, days: 0)
    qp = {} if raw is None else {"days": raw}
    body = json.loads(nl_route.handle_stats({}, {}, qp)["body"])
    assert body["metrics"]["days"] == expected


def test_newsletter_scan_failure_is_500(monkeypatch) -> None:
    monkeypatch.setattr(nl_route.subscribers_repo, "list_all", _raising_list_all)
    resp = nl_route.handle_stats({}, {}, {})
    assert resp["statusCode"] == 500
    assert json.loads(resp["body"])["error"] == "subscribers scan failed"
    assert_no_cors(resp)
