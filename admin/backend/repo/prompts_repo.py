"""admin 프롬프트 CRUD — PostgreSQL 상시 서버(lens-cms-api) 경유 (v1.27).

posts_repo.py(v1.21)/quiz_repo.py(v1.22)와 같은 패턴. 실제 CRUD 로직은
service/lens-cms-api/prompts_repo.py가 갖고 있다. 공개 읽기(prompt_loader.py,
pipelines/common/ddb_prompt.py)는 이 모듈을 안 쓴다 — 인증 없는 별도
public 엔드포인트(GET /api/v2/prompts/{category}/{name})를 각자 직접 부른다.
"""
from __future__ import annotations

import urllib.error

from shared import lens_cms_client


def _request(method: str, path: str, body: dict | None = None, query: dict | None = None) -> dict:
    try:
        return lens_cms_client.request(method, path, body=body, query=query)
    except urllib.error.HTTPError as e:
        if e.code == 404:
            return {}
        raise


def list_prompts() -> list[dict]:
    resp = _request("GET", "/internal/admin/prompts")
    return resp.get("prompts", [])


def get_prompt(category: str, name: str) -> dict | None:
    resp = _request("GET", f"/internal/admin/prompts/{category}/{name}")
    return resp or None


def get_prompt_history(category: str, name: str) -> list[dict]:
    resp = _request("GET", f"/internal/admin/prompts/{category}/{name}/history")
    return resp.get("history", [])


def get_prompt_version(category: str, name: str, version: int) -> dict | None:
    resp = _request("GET", f"/internal/admin/prompts/{category}/{name}/versions/{version}")
    return resp or None


def update_prompt(category: str, name: str, content: str, sections: dict | None) -> dict:
    body = {"content": content}
    if sections is not None:
        body["sections"] = sections
    return _request("PUT", f"/internal/admin/prompts/{category}/{name}", body=body)
