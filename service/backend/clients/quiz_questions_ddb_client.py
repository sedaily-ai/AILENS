"""용어 퀴즈 공개 읽기 — PostgreSQL 상시 서버(lens-cms-api) 경유 (v1.22).

파일명은 과거(DynamoDB) 그대로 남겼다 — handlers/quiz_public.py가 이
이름으로 import하고 있어 호출부를 바꿀 필요가 없게 하기 위함. 실제로는
더 이상 DynamoDB를 보지 않는다. 쓰기(admin/backend/repo/quiz_repo.py)와
같은 lens-cms-api(EC2)를 본다 — 실제 CRUD/조회 로직은
service/lens-cms-api/quiz_repo.py::list_published_quizzes()에 있다.
"""
from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from typing import Any, Dict, List
from config.constants import LENS_CMS_API_DEFAULT_URL

_API_URL = os.environ.get("LENS_CMS_API_URL", LENS_CMS_API_DEFAULT_URL)
_TIMEOUT_SECONDS = 5


def list_published_quizzes(limit: int = 4) -> List[Dict[str, Any]]:
    """status=published 전체(soft-delete 제외) 중 발행일 최신순 최대 limit개."""
    url = f"{_API_URL}/api/quiz/today?limit={limit}"
    req = urllib.request.Request(url, method="GET")
    try:
        with urllib.request.urlopen(req, timeout=_TIMEOUT_SECONDS) as res:
            data = json.loads(res.read())
    except (urllib.error.URLError, TimeoutError, OSError):
        return []
    return data.get("quizzes", [])
