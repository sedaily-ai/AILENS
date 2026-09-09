"""CMS 글 공개 조회 — 상시 서버 버전 (v1.20).

handlers/cms_posts_public.py(Lambda)와 계약 동일:
  GET /api/v2/posts?channel=...&date=...&limit=...
  GET /api/v2/posts/{slug}?channel=...

Lambda 버전과의 차이는 순수 인프라 계층뿐(커넥션 풀 재사용, VPC 내
상시 프로세스) — 쿼리·shaping 로직은 그대로 포팅했다.
"""
from __future__ import annotations

import os
from typing import Any, Dict, Optional

from fastapi import Body, FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

import admin_posts_repo
import cms_posts_repo as posts_client
from cms_posts_shaping import (
    SHAPERS,
    shape_letter,
    shape_lens_summary,
    shape_webtoon_summary,
    shape_home_player_summary,
)

app = FastAPI(title="lens-cms-api")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)

_LIST_SHAPERS = {
    **SHAPERS,
    "lens": shape_lens_summary,
    "webtoon": shape_webtoon_summary,
    "home_player": shape_home_player_summary,
}
_VALID_CHANNELS = ("letters", "paper", "feed", "webtoon", "video", "lens", "home_player")
_CACHE_CONTROL = "no-store"


@app.get("/health")
def health():
    return {"status": "ok"}


@app.get("/api/v2/posts/{slug}")
def get_post(slug: str, channel: Optional[str] = Query(default=None)):
    post = posts_client.get_published_post_by_slug(slug, channel=channel)
    if not post:
        raise HTTPException(status_code=404, detail="post not found")
    post_channel = (post.get("channels") or ["letters"])[0]
    shaper = SHAPERS.get(post_channel, shape_letter)
    return JSONResponse(
        {"post": shaper(post)},
        headers={"Cache-Control": _CACHE_CONTROL},
    )


@app.get("/api/v2/posts")
def list_posts(
    channel: str = Query(default="letters"),
    date: Optional[str] = Query(default=None),
    limit: int = Query(default=20),
):
    if channel not in _VALID_CHANNELS:
        raise HTTPException(status_code=400, detail=f"invalid channel: {channel}")
    limit = max(1, min(limit, 1000))
    rows = posts_client.list_published_posts(channel, date, limit=limit)
    payload = {
        "channel": channel,
        "date": date,
        "posts": [_LIST_SHAPERS[channel](r) for r in rows],
    }
    return JSONResponse(payload, headers={"Cache-Control": _CACHE_CONTROL})


# ── admin 쓰기(CRUD) — v1.21 ──────────────────────────────────────────
# admin/backend(Lambda)가 DynamoDB 대신 이 내부 API를 호출한다. admin
# Lambda를 RDS와 같은 VPC에 직접 붙이면 오늘 해결한 Lambda+RDS 문제가
# 재발할 뿐 아니라 CloudWatch/EventBridge/SSM/webhook 같은 다른 인터넷
# 접근까지 깨지므로, RDS 접근을 이 상시 서버 하나로 집중시킨다.
# 공유 시크릿 헤더(X-Internal-Token)로 보호 — 아직 HTTPS 경유 안 함
# (직접 EC2 공인 IP:80 호출, TODO: CloudFront behavior 추가해 HTTPS화).
_ADMIN_TOKEN = os.environ.get("ADMIN_INTERNAL_TOKEN", "")


def _check_admin_token(x_internal_token: Optional[str]) -> None:
    if not _ADMIN_TOKEN or x_internal_token != _ADMIN_TOKEN:
        raise HTTPException(status_code=401, detail="unauthorized")


@app.post("/admin/posts")
def admin_create_post(payload: Dict[str, Any] = Body(...), x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    data = payload.get("data") or {}
    created_by = payload.get("created_by", "admin")
    return {"post": admin_posts_repo.create(data, created_by)}


@app.get("/admin/posts")
def admin_list_posts(
    status: Optional[str] = Query(default=None),
    channel: Optional[str] = Query(default=None),
    limit: int = Query(default=50),
    date: Optional[str] = Query(default=None),
    x_internal_token: Optional[str] = Header(default=None),
):
    _check_admin_token(x_internal_token)
    limit = max(1, min(limit, 200))
    posts = admin_posts_repo.list_posts(status, channel, limit, date)
    return {"posts": posts, "count": len(posts)}


@app.get("/admin/posts/{post_id}")
def admin_get_post(post_id: str, x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    post = admin_posts_repo.get(post_id)
    if not post:
        raise HTTPException(status_code=404, detail="post not found")
    return {"post": post}


@app.put("/admin/posts/{post_id}")
def admin_update_post(post_id: str, data: Dict[str, Any] = Body(...), x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    post = admin_posts_repo.update(post_id, data)
    if not post:
        raise HTTPException(status_code=404, detail="post not found")
    return {"post": post}


@app.post("/admin/posts/{post_id}/status")
def admin_set_status(post_id: str, payload: Dict[str, Any] = Body(...), x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    status = payload.get("status", "")
    try:
        post = admin_posts_repo.set_status(post_id, status)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not post:
        raise HTTPException(status_code=404, detail="post not found")
    return {"post": post}


@app.delete("/admin/posts/{post_id}")
def admin_delete_post(post_id: str, x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    if not admin_posts_repo.soft_delete(post_id):
        raise HTTPException(status_code=404, detail="post not found")
    return {"ok": True}
