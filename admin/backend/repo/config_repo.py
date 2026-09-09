"""feature flag · threshold · admin 로그인 잠금 — PostgreSQL 상시 서버
(lens-cms-api) 경유 (v1.28).

posts_repo.py(v1.21)와 같은 패턴. 실제 CRUD 로직은
service/lens-cms-api/config_repo.py가 갖고 있다.
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


def _request(method: str, path: str, body: dict | None = None) -> dict:
    url = f"{_API_URL}{path}"
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


# --- feature flags / thresholds ---

def list_feature_flags() -> dict:
    return _request("GET", "/internal/config/feature-flags").get("flags", {})


def set_feature_flag(name: str, enabled: bool) -> str:
    resp = _request("PUT", f"/internal/config/feature-flags/{urllib.parse.quote(name)}", body={"enabled": enabled})
    return resp["updated_at"]


def list_thresholds() -> dict:
    return _request("GET", "/internal/config/thresholds").get("thresholds", {})


def set_threshold(name: str, value: int) -> str:
    resp = _request("PUT", f"/internal/config/thresholds/{urllib.parse.quote(name)}", body={"value": value})
    return resp["updated_at"]


# --- admin login lockout ---

def check_lockout() -> int | None:
    return _request("POST", "/internal/auth/lockout/check").get("retry_after_seconds")


def record_login_fail(threshold: int, lockout_minutes: int) -> tuple[int, str | None]:
    resp = _request("POST", "/internal/auth/lockout/fail", body={
        "threshold": threshold, "lockout_minutes": lockout_minutes,
    })
    return resp["fail_count"], resp.get("lockout_until")


def reset_login_fail() -> None:
    _request("POST", "/internal/auth/lockout/reset")
