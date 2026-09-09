"""quiz_questions 쓰기 — PostgreSQL 상시 서버(lens-cms-api) 경유 (v1.22).

posts_repo.py(v1.21)와 같은 패턴 — admin Lambda가 RDS에 직접 붙지 않고
lens-cms-api(EC2)의 내부 API를 호출한다. 실제 CRUD 로직은
service/lens-cms-api/quiz_repo.py가 갖고 있다.

공개 읽기(홈 화면 "오늘의 단어 퀴즈")는 여기 두지 않는다 — 공개 API는
admin이 아니라 별도 Lambda(sedaily-mbti-v2-quiz-dev)라 이 모듈을 import
할 수 없다. 그쪽은 service/backend/clients/quiz_questions_ddb_client.py
(이름은 그대로지만 v1.22부터 이 서버를 호출)를 통해 같은 lens-cms-api를
본다.
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
    try:
        with urllib.request.urlopen(req, timeout=_TIMEOUT_SECONDS) as res:
            return json.loads(res.read())
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return {}
        body_text = e.read().decode(errors="replace")
        logger.error(f"lens-cms-api {method} {path} -> {e.code}: {body_text}")
        raise


def create(data: dict, created_by: str) -> dict:
    resp = _request("POST", "/admin/quizzes", body={"data": data, "created_by": created_by})
    return resp["quiz"]


def get(quiz_id: str) -> dict | None:
    resp = _request("GET", f"/admin/quizzes/{quiz_id}")
    return resp.get("quiz")


def list_quiz(status: str | None, limit: int = 50) -> list[dict]:
    resp = _request("GET", "/admin/quizzes", query={"status": status, "limit": limit})
    return resp.get("quizzes", [])


def update(quiz_id: str, data: dict) -> dict | None:
    resp = _request("PUT", f"/admin/quizzes/{quiz_id}", body=data)
    return resp.get("quiz")


def set_status(quiz_id: str, status: str) -> dict | None:
    resp = _request("POST", f"/admin/quizzes/{quiz_id}/status", body={"status": status})
    return resp.get("quiz")


def soft_delete(quiz_id: str) -> bool:
    resp = _request("DELETE", f"/admin/quizzes/{quiz_id}")
    return bool(resp.get("ok"))
