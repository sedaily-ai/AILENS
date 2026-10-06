"""CORS 중립 HTTP 응답 빌더.

헤더는 호출자가 정한다. 이 모듈은 config/ 를 import 하지 않으므로 CORS 헤더가
여기서 주입될 방법이 없다 — v1 은 core/response.py 에서 CORS_HEADERS 를 얹고,
admin 은 API Gateway 가 CORS 를 처리하므로 얹지 않는다.

직렬화 로직은 core/response.py 의 _json_serializer 와 동일하다.
"""

from __future__ import annotations

import json
from datetime import date, datetime
from decimal import Decimal
from typing import Any

DEFAULT_HEADERS = {"Content-Type": "application/json; charset=utf-8"}


def _serializer(obj: Any) -> Any:
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    if isinstance(obj, Decimal):
        return int(obj) if obj % 1 == 0 else float(obj)
    if isinstance(obj, set):
        return list(obj)
    if hasattr(obj, "to_dict"):
        return obj.to_dict()
    if hasattr(obj, "__dict__"):
        return obj.__dict__
    raise TypeError(f"Object of type {type(obj).__name__} is not JSON serializable")


def json_dumps(data: Any) -> str:
    return json.dumps(data, default=_serializer, ensure_ascii=False)


def _build(status: int, body: Any, headers: dict | None) -> dict:
    merged = {**DEFAULT_HEADERS}
    if headers:
        merged.update(headers)
    return {"statusCode": status, "headers": merged, "body": json_dumps(body)}


def success(data: Any, status: int = 200, headers: dict | None = None) -> dict:
    return _build(status, data, headers)


def error(
    message: str,
    status: int = 500,
    code: str | None = None,
    details: dict | None = None,
    retry_possible: bool = False,
    headers: dict | None = None,
) -> dict:
    body: dict = {"error": message}
    if code:
        body["code"] = code
    if details:
        body["details"] = details
    if retry_possible:
        body["retry_possible"] = True
    return _build(status, body, headers)
