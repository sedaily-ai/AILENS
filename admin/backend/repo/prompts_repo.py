"""admin 프롬프트 CRUD — PostgreSQL 상시 서버(lens-cms-api) 경유 (v1.27).

posts_repo.py(v1.21)/quiz_repo.py(v1.22)와 같은 패턴. 실제 CRUD 로직은
service/lens-cms-api/prompts_repo.py가 갖고 있다. 공개 읽기(prompt_loader.py,
pipelines/common/ddb_prompt.py)는 이 모듈을 안 쓴다 — 인증 없는 별도
public 엔드포인트(GET /api/v2/prompts/{category}/{name})를 각자 직접 부른다.
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


def list_prompts() -> list[dict]:
    resp = _request("GET", "/internal/admin/prompts")
    return resp.get("prompts", [])


def get_prompt(category: str, name: str) -> dict | None:
    resp = _request("GET", f"/internal/admin/prompts/{category}/{name}")
    return resp or None


def update_prompt(category: str, name: str, content: str, sections: dict | None) -> dict:
    body = {"content": content}
    if sections is not None:
        body["sections"] = sections
    return _request("PUT", f"/internal/admin/prompts/{category}/{name}", body=body)
