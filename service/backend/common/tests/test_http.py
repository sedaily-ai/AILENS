"""common/http.py — CORS 중립 응답 빌더.

Run from service/backend/::

    python3 -m pytest common/tests/test_http.py -v
"""
from __future__ import annotations

import json
from datetime import date, datetime, timezone
from decimal import Decimal

from common import http


def test_success_defaults_to_200_and_content_type_only() -> None:
    resp = http.success({"a": 1})
    assert resp["statusCode"] == 200
    assert resp["headers"] == {"Content-Type": "application/json; charset=utf-8"}
    assert json.loads(resp["body"]) == {"a": 1}


def test_success_never_injects_cors_headers() -> None:
    """common 은 config/ 를 import 하지 않으므로 CORS 가 들어올 경로가 없다."""
    resp = http.success({"a": 1})
    for key in resp["headers"]:
        assert not key.lower().startswith("access-control-")


def test_success_merges_caller_headers() -> None:
    resp = http.success({}, headers={"Cache-Control": "max-age=60"})
    assert resp["headers"]["Cache-Control"] == "max-age=60"
    assert resp["headers"]["Content-Type"] == "application/json; charset=utf-8"


def test_error_body_uses_error_key() -> None:
    resp = http.error("boom", 400)
    assert resp["statusCode"] == 400
    assert json.loads(resp["body"]) == {"error": "boom"}


def test_error_includes_optional_fields_only_when_given() -> None:
    resp = http.error("boom", 400, code="X", details={"f": 1}, retry_possible=True)
    body = json.loads(resp["body"])
    assert body == {"error": "boom", "code": "X", "details": {"f": 1}, "retry_possible": True}


def test_error_omits_falsy_optionals() -> None:
    body = json.loads(http.error("boom")["body"])
    assert body == {"error": "boom"}


def test_json_dumps_serializes_datetime_date_decimal_set() -> None:
    out = json.loads(http.json_dumps({
        "dt": datetime(2026, 7, 29, 5, 0, tzinfo=timezone.utc),
        "d": date(2026, 7, 29),
        "whole": Decimal("3"),
        "frac": Decimal("1.5"),
        "s": {"x"},
    }))
    assert out["dt"].startswith("2026-07-29T05:00:00")
    assert out["d"] == "2026-07-29"
    assert out["whole"] == 3 and isinstance(out["whole"], int)
    assert out["frac"] == 1.5
    assert out["s"] == ["x"]


def test_json_dumps_uses_to_dict_when_available() -> None:
    class Thing:
        def to_dict(self):
            return {"k": "v"}

    assert json.loads(http.json_dumps({"t": Thing()})) == {"t": {"k": "v"}}


def test_json_dumps_keeps_non_ascii_readable() -> None:
    assert "한글" in http.json_dumps({"k": "한글"})
