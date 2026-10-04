"""뉴스레터 구독자 저장 — PostgreSQL 상시 서버(lens-cms-api) 경유 클라이언트.

검증·동의 확인·메일 발송은 handlers/content/subscribe.py 가 담당하고, 이 모듈은 저장만 담당한다.
토큰은 SSM SecureString 에서 읽으며 admin 쪽과 동일한 lens-cms-api 토큰 값을 사용한다.
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from typing import Any, Dict, List, Optional

from common.secrets import get_secret
from config.constants import LENS_CMS_API_DEFAULT_URL

_API_URL = os.environ.get("LENS_CMS_API_URL", LENS_CMS_API_DEFAULT_URL)
# admin 역할은 /sedaily-mbti/admin/*, 이 Lambda 의 공용 역할(sedaily-mbti-v2-collector-dev-role)은
# /sedaily-mbti/v2/* 만 읽을 수 있어 동일한 토큰 값을 두 경로에 각각 저장해 두었다.
_TOKEN_PARAM = os.environ.get("LENS_CMS_API_TOKEN_PARAM", "/sedaily-mbti/v2/lens-cms-api-token")
_TIMEOUT_SECONDS = 8


def _request(method: str, path: str, body: Optional[dict] = None, query: Optional[dict] = None) -> dict:
    url = f"{_API_URL}{path}"
    if query:
        qs = "&".join(f"{k}={v}" for k, v in query.items() if v is not None)
        if qs:
            url = f"{url}?{qs}"
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(
        url,
        data=data,
        headers={
            "Content-Type": "application/json",
            "X-Internal-Token": get_secret(_TOKEN_PARAM),
        },
        method=method,
    )
    with urllib.request.urlopen(req, timeout=_TIMEOUT_SECONDS) as res:
        return json.loads(res.read())


def subscribe(email: str, consent: bool, name: Optional[str] = None,
              onboarding_format: Optional[str] = None,
              onboarding_interests: Optional[List[str]] = None) -> Dict[str, Any]:
    resp = _request("POST", "/internal/subscriptions", body={
        "email": email, "consent": consent, "name": name,
        "onboarding_format": onboarding_format,
        "onboarding_interests": onboarding_interests,
    })
    return resp["subscriber"]


def unsubscribe_by_token(token: str) -> bool:
    try:
        resp = _request("POST", "/internal/subscriptions/unsubscribe", body={"token": token})
    except urllib.error.HTTPError:
        return False
    return bool(resp.get("ok"))

