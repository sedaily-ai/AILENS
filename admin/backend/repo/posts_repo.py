"""cms_posts 쓰기 — PostgreSQL 상시 서버(lens-cms-api) 경유 (v1.21).

2026-08-04~2026-09-09: DynamoDB(sedaily-mbti-cms-posts-dev) 직접 접근이었다.
v1.20에서 공개 읽기 API가 Postgres로 전환되면서 admin이 여전히 DynamoDB에만
쓰던 것이 "새 글이 라이브에 안 보이는" 동기화 버그로 드러나(docs/architecture/
db-changelog/postgres/v1.21-admin-쓰기-전환.md 참조), 이 파일을 Postgres
쪽으로 전환했다.

admin Lambda가 RDS에 직접 붙지 않는다 — VPC를 붙이면 오늘(v1.20) 겪은
Lambda+RDS 문제가 재발할 뿐 아니라 CloudWatch/EventBridge/SSM/revalidate
webhook 같은 이 Lambda의 다른 인터넷 접근까지 깨진다. 대신 이미 RDS와
같은 VPC에서 커넥션 풀을 유지하는 상시 서버(lens-cms-api-prod, EC2)를
내부 API로 호출한다 — service/lens-cms-api/admin_posts_repo.py가 실제
쿼리 로직을 갖고 있고, 여기는 그 HTTP 클라이언트일 뿐이다.

공개 API용 읽기 전용 클라이언트는 여전히 별도(service/backend/clients/
cms_posts_pg_client.py, Lambda) — 그쪽은 이 파일을 import할 수 없다(다른
Lambda 패키지). 쿼리·스키마를 바꾸면 service/lens-cms-api/ 쪽도 같이
고친다.
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
    resp = _request("POST", "/admin/posts", body={"data": data, "created_by": created_by})
    return resp["post"]


def get(post_id: str, channel: str | None = None) -> dict | None:
    resp = _request("GET", f"/admin/posts/{post_id}", query={"channel": channel} if channel else None)
    return resp.get("post")


def list_posts(
    status: str | None,
    channel: str | None,
    limit: int = 50,
    date: str | None = None,
) -> list[dict]:
    resp = _request(
        "GET", "/admin/posts",
        query={"status": status, "channel": channel, "limit": limit, "date": date},
    )
    return resp.get("posts", [])


def update(post_id: str, data: dict) -> dict | None:
    resp = _request("PUT", f"/admin/posts/{post_id}", body=data)
    return resp.get("post")


def set_status(post_id: str, status: str) -> dict | None:
    resp = _request("POST", f"/admin/posts/{post_id}/status", body={"status": status})
    return resp.get("post")


def soft_delete(post_id: str) -> bool:
    resp = _request("DELETE", f"/admin/posts/{post_id}")
    return bool(resp.get("ok"))
