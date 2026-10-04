"""뉴스레터 구독자 저장 — PostgreSQL 상시 서버(lens-cms-api) 경유 (v1.23).

handlers/subscribe.py의 검증·CAN-SPAM consent 체크·SES 발송 로직은
그대로 두고, 저장(DynamoDB put_item/scan/update_item)만 여기로 옮겼다.
공유 시크릿은 SSM SecureString(`/sedaily-mbti/admin/lens-cms-api-token`)
— admin/backend/repo/posts_repo.py(v1.21)와 같은 파라미터를 그대로 읽는다
(같은 lens-cms-api 서버를 보므로 토큰도 같다).
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
# admin Lambda 쪽 역할은 /sedaily-mbti/admin/* 만 읽을 수 있고, 이 Lambda가
# 쓰는 공용 역할(sedaily-mbti-v2-collector-dev-role)은 /sedaily-mbti/v2/*
# 만 읽을 수 있어(V2SecretsAccess 정책) 같은 값을 두 경로에 각각 저장해뒀다
# — 공용 역할의 IAM 정책 범위를 넓히는 대신, 배포 영향을 이 파일로만 좁힘.
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

