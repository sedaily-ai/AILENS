"""lens-cms-api(내부 admin 전용 HTTP API) 공용 저수준 클라이언트.

repo/prompts_repo.py · repo/prompt_lab_repo.py · repo/chat_threads_repo.py
세 곳이 URL 조립·요청 객체 생성·타임아웃·에러 로깅을 거의 그대로 복붙해서
갖고 있었다(2026-09-16 리팩토링 감사, admin/backend/CLAUDE.md의 "2개 이상이면
shared/로 승격" 기준) — 이 저수준 왕복만 여기로 승격한다.

404 처리는 세 repo가 서로 다르게 한다(prompts_repo는 없는 리소스를 `{}`로
조용히 흡수, prompt_lab_repo/chat_threads_repo는 NotFoundError를 던진다) —
그 차이는 기존 동작을 그대로 보존하기 위해 각 repo에 남겨두고, 여기는 순수
HTTP 요청 + (404 제외) 실패 로깅까지만 담당한다.
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

API_URL = os.environ.get("LENS_CMS_API_URL", "http://13.223.179.151")
_TOKEN_PARAM = os.environ.get("LENS_CMS_API_TOKEN_PARAM", "/sedaily-mbti/admin/lens-cms-api-token")
TIMEOUT_SECONDS = 8


def request(method: str, path: str, body: dict | None = None, query: dict | None = None) -> dict:
    """lens-cms-api 내부 엔드포인트 호출. 실패하면 urllib.error.HTTPError를
    그대로 올린다 — 404를 어떻게 다룰지는 호출부(각 repo) 책임이다."""
    url = f"{API_URL}{path}"
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
        with urllib.request.urlopen(req, timeout=TIMEOUT_SECONDS) as res:
            return json.loads(res.read())
    except urllib.error.HTTPError as e:
        if e.code != 404:
            body_text = e.read().decode(errors="replace")
            logger.error(f"lens-cms-api {method} {path} -> {e.code}: {body_text}")
        raise
