"""newsletter 구독자 — 통계 대시보드(routes/newsletter.py) 읽기 전용 (v1.23).

posts_repo.py(v1.21)/quiz_repo.py(v1.22)와 같은 패턴 — PostgreSQL
(subscriptions 테이블)을 lens-cms-api(EC2) 내부 API 경유로 읽는다.
구독 자체(생성/해지)는 여전히 service/backend의 handlers/subscribe.py가
담당(같은 lens-cms-api를 본다) — 쓰기 경로가 필요해지면 여기 추가하지
않는다.
"""
from __future__ import annotations

import json
import os
import urllib.request

from shared.ssm_client import get_secure

_API_URL = os.environ.get("LENS_CMS_API_URL", "http://13.223.179.151")
_TOKEN_PARAM = os.environ.get("LENS_CMS_API_TOKEN_PARAM", "/sedaily-mbti/admin/lens-cms-api-token")
_TIMEOUT_SECONDS = 8


def list_all() -> list[dict]:
    """전체 구독자의 email/status/created_at(그 외 필드도 같이 오지만
    routes/newsletter.py가 이 셋만 씀)."""
    req = urllib.request.Request(
        f"{_API_URL}/internal/subscriptions",
        headers={"X-Internal-Token": get_secure(_TOKEN_PARAM)},
        method="GET",
    )
    with urllib.request.urlopen(req, timeout=_TIMEOUT_SECONDS) as res:
        return json.loads(res.read()).get("subscribers", [])
