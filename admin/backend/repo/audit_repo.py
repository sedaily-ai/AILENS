"""감사 로그 — PostgreSQL 상시 서버(lens-cms-api) 경유 (v1.27).

shared/audit.py::log()가 이 모듈을 호출한다(모든 admin route의 audit.log()
호출이 자동으로 여길 거친다 — 호출부 20여 곳을 개별 수정할 필요 없이 이
단일 지점만 바꾸면 됐다). routes/audit.py(조회 화면)도 이 모듈을 쓴다.
"""
from __future__ import annotations

import json
import logging
import os
import urllib.error
import urllib.parse
import urllib.request

from shared.ssm_client import get_secure

logger = logging.getLogger(__name__)

_API_URL = os.environ.get("LENS_CMS_API_URL", "http://13.223.179.151")
_TOKEN_PARAM = os.environ.get("LENS_CMS_API_TOKEN_PARAM", "/sedaily-mbti/admin/lens-cms-api-token")
_TIMEOUT_SECONDS = 8


def _request(method: str, path: str, body: dict | None = None, query: dict | None = None) -> dict:
    url = f"{_API_URL}{path}"
    if query:
        qs = "&".join(f"{k}={urllib.parse.quote(str(v))}" for k, v in query.items() if v is not None)
        if qs:
            url = f"{url}?{qs}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Content-Type": "application/json",
            "X-Internal-Token": get_secure(_TOKEN_PARAM),
        },
        method=method,
    )
    with urllib.request.urlopen(req, timeout=_TIMEOUT_SECONDS) as res:
        return json.loads(res.read())


def log_event(action: str, detail: dict | None, actor: str, session: str | None, source_ip: str | None) -> None:
    _request("POST", "/internal/audit/log", body={
        "action": action, "detail": detail, "actor": actor,
        "session": session, "source_ip": source_ip,
    })


def list_events(limit: int, cursor: str | None) -> tuple[list[dict], str | None]:
    resp = _request("GET", "/internal/audit", query={"limit": limit, "cursor": cursor})
    return resp.get("audits", []), resp.get("next_cursor")
