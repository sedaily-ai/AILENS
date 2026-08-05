"""cost · audit · newsletter 의 현재 응답을 박제한다 (characterization).

Run from service/backend/::

    python3 -m pytest admin/tests/test_readonly_routes.py -v
"""
from __future__ import annotations

import base64
import json

import pytest

from conftest import FakeTable, assert_no_cors

from routes import audit as audit_route
from shared import ddb_client

_ROWS = [
    {"pk": "AUDIT", "sk": "2026-07-29T05:00:00.000000Z", "action": "login-success",
     "actor": "admin", "session": "2026-07-29T04:00:00Z", "source_ip": "203.0.113.7"},
    {"pk": "AUDIT", "sk": "2026-07-29T04:00:00.000000Z", "action": "prompt-update",
     "actor": "admin", "detail": {"prompt": "transform/nt"}},
]


@pytest.fixture
def wired(monkeypatch) -> FakeTable:
    table = FakeTable(items=_ROWS)
    monkeypatch.setattr(ddb_client, "config_table", lambda: table)
    return table


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
    assert_no_cors(resp)


def test_audit_rejects_non_integer_limit(wired) -> None:
    resp = audit_route.handle_list({}, {}, {"limit": "abc"})
    assert resp["statusCode"] == 400
    assert json.loads(resp["body"])["error"] == "limit must be integer"
    assert_no_cors(resp)


@pytest.mark.parametrize("payload,label", [
    ("[1, 2]", "JSON 배열"),
    ("5", "JSON 정수"),
    ('"pk"', "JSON 문자열"),
    ("null", "JSON null"),
])
def test_audit_rejects_cursor_that_is_valid_json_but_not_an_object(
    wired, payload: str, label: str
) -> None:
    """base64 도 JSON 도 통과하지만 dict 가 아닌 커서는 400 이어야 한다.

    커서는 클라이언트 입력이다. dict 검증이 없으면 이런 값이 그대로
    boto3 ``ExclusiveStartKey`` 로 넘어가 거기서 터지고, 400 이어야 할 잘못된
    입력이 500 이 된다. 디코딩 실패(깨진 base64 등)만 검사하던 이전 구현이
    놓치던 구멍이다.
    """
    cursor = base64.urlsafe_b64encode(payload.encode()).decode()
    resp = audit_route.handle_list({}, {}, {"cursor": cursor})
    assert resp["statusCode"] == 400, f"{label} 커서가 400 이 아니다"
    assert json.loads(resp["body"])["error"] == "invalid cursor"
    assert_no_cors(resp)


def test_audit_accepts_well_formed_object_cursor(wired) -> None:
    """정상 커서는 그대로 ExclusiveStartKey 로 전달돼야 한다 — 검증이 과하지 않은지."""
    key = {"pk": "AUDIT", "sk": "2026-07-29T05:00:00.000000Z#abcd"}
    cursor = base64.urlsafe_b64encode(json.dumps(key).encode()).decode()
    resp = audit_route.handle_list({}, {}, {"cursor": cursor})
    assert resp["statusCode"] == 200
    assert wired.query_calls[-1]["ExclusiveStartKey"] == key


def test_audit_clamps_limit_to_max(wired) -> None:
    audit_route.handle_list({}, {}, {"limit": "9999"})
    assert wired.query_calls[-1]["Limit"] == audit_route.MAX_LIMIT


def test_audit_clamps_limit_to_min(wired) -> None:
    audit_route.handle_list({}, {}, {"limit": "0"})
    assert wired.query_calls[-1]["Limit"] == 1


def test_audit_queries_descending(wired) -> None:
    audit_route.handle_list({}, {}, {})
    assert wired.query_calls[-1]["ScanIndexForward"] is False


def test_audit_returns_null_cursor_when_no_more_pages(wired) -> None:
    resp = audit_route.handle_list({}, {}, {})
    assert json.loads(resp["body"])["next_cursor"] is None


def test_audit_returns_cursor_when_more_pages_exist(monkeypatch) -> None:
    class Paged(FakeTable):
        def query(self, **kwargs):
            out = super().query(**kwargs)
            out["LastEvaluatedKey"] = {"pk": "AUDIT", "sk": "2026-07-29T04:00:00.000000Z"}
            return out

    table = Paged(items=_ROWS)
    monkeypatch.setattr(ddb_client, "config_table", lambda: table)
    resp = audit_route.handle_list({}, {}, {})
    cursor = json.loads(resp["body"])["next_cursor"]
    assert isinstance(cursor, str) and cursor
    assert audit_route._decode_cursor(cursor) == {"pk": "AUDIT", "sk": "2026-07-29T04:00:00.000000Z"}


def test_audit_cursor_round_trips_into_exclusive_start_key(monkeypatch) -> None:
    import base64

    table = FakeTable(items=_ROWS)
    monkeypatch.setattr(ddb_client, "config_table", lambda: table)
    key = {"pk": "AUDIT", "sk": "2026-07-29T04:00:00.000000Z"}
    cursor = base64.urlsafe_b64encode(json.dumps(key).encode()).decode()

    audit_route.handle_list({}, {}, {"cursor": cursor})
    assert table.query_calls[-1]["ExclusiveStartKey"] == key


def test_audit_rejects_malformed_cursor(wired) -> None:
    resp = audit_route.handle_list({}, {}, {"cursor": "!!!not-base64!!!"})
    assert resp["statusCode"] == 400
    assert json.loads(resp["body"])["error"] == "invalid cursor"


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


class _FakeScanTable:
    def __init__(self, items: list[dict], raise_on_scan: bool = False):
        self._items = items
        self._raise = raise_on_scan

    def scan(self, **kwargs) -> dict:
        if self._raise:
            raise RuntimeError("ddb down")
        return {"Items": list(self._items)}


class _FakeDdb:
    def __init__(self, table: _FakeScanTable):
        self._table = table

    def Table(self, name: str) -> _FakeScanTable:
        return self._table


_SUBS = [
    {"email": "abcd@x.com", "mbti_group": "NT", "status": "active", "created_at": "2026-07-01"},
    {"email": "ef@y.com", "mbti_group": "NF", "status": "unsubscribed", "created_at": "2026-06-01"},
]

# 지표마다 값을 다르게 둔다. 전부 같은 값이면 open_rate/click_rate/delivery_rate
# 계산이 서로 뒤바뀌어도 셋 다 같은 수가 나와 회귀를 감지할 수 없다.
_SES = {"Send": 100, "Delivery": 90, "Open": 50, "Click": 10, "Bounce": 5, "Complaint": 2}


def test_newsletter_stats_shape_and_active_only_grouping(monkeypatch) -> None:
    monkeypatch.setattr(nl_route, "_ddb", _FakeDdb(_FakeScanTable(_SUBS)))
    monkeypatch.setattr(nl_route, "_ses_sum", lambda metric, days: 100)

    resp = nl_route.handle_stats({}, {}, {})
    assert resp["statusCode"] == 200
    body = json.loads(resp["body"])
    assert set(body) == {"subscribers", "metrics"}
    subs = body["subscribers"]
    assert set(subs) == {"total", "active", "by_group", "recent"}
    assert subs["total"] == 2
    assert subs["active"] == 1
    # by_group 은 active 만 센다. 4개 그룹 키가 항상 존재한다.
    assert subs["by_group"] == {"NT": 1, "NF": 0, "ST": 0, "SF": 0}
    assert_no_cors(resp)


def test_newsletter_masks_recent_emails(monkeypatch) -> None:
    monkeypatch.setattr(nl_route, "_ddb", _FakeDdb(_FakeScanTable(_SUBS)))
    monkeypatch.setattr(nl_route, "_ses_sum", lambda metric, days: 0)
    body = json.loads(nl_route.handle_stats({}, {}, {})["body"])
    emails = [r["email"] for r in body["subscribers"]["recent"]]
    assert "a**d@x.com" in emails      # local 4자 → 첫·끝 남기고 마스킹
    assert "e*@y.com" in emails        # local 2자 이하 → 첫 글자 + '*'


def test_newsletter_computes_rates_from_ses_sums(monkeypatch) -> None:
    monkeypatch.setattr(nl_route, "_ddb", _FakeDdb(_FakeScanTable([])))
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
    monkeypatch.setattr(nl_route, "_ddb", _FakeDdb(_FakeScanTable([])))
    monkeypatch.setattr(nl_route, "_ses_sum", lambda metric, days: 0)
    metrics = json.loads(nl_route.handle_stats({}, {}, {})["body"])["metrics"]
    assert metrics["open_rate"] == 0.0
    assert metrics["click_rate"] == 0.0
    assert metrics["delivery_rate"] == 0.0


@pytest.mark.parametrize("raw,expected", [("0", 1), ("999", 90), ("abc", 7), (None, 7)])
def test_newsletter_clamps_days(monkeypatch, raw, expected: int) -> None:
    monkeypatch.setattr(nl_route, "_ddb", _FakeDdb(_FakeScanTable([])))
    monkeypatch.setattr(nl_route, "_ses_sum", lambda metric, days: 0)
    qp = {} if raw is None else {"days": raw}
    body = json.loads(nl_route.handle_stats({}, {}, qp)["body"])
    assert body["metrics"]["days"] == expected


def test_newsletter_scan_failure_is_500(monkeypatch) -> None:
    monkeypatch.setattr(nl_route, "_ddb", _FakeDdb(_FakeScanTable([], raise_on_scan=True)))
    resp = nl_route.handle_stats({}, {}, {})
    assert resp["statusCode"] == 500
    assert json.loads(resp["body"])["error"] == "subscribers scan failed"
    assert_no_cors(resp)
