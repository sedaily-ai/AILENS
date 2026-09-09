"""CMS 글 공개 조회 — 상시 서버 버전 (v1.20).

handlers/cms_posts_public.py(Lambda)와 계약 동일:
  GET /api/v2/posts?channel=...&date=...&limit=...
  GET /api/v2/posts/{slug}?channel=...

Lambda 버전과의 차이는 순수 인프라 계층뿐(커넥션 풀 재사용, VPC 내
상시 프로세스) — 쿼리·shaping 로직은 그대로 포팅했다.
"""
from __future__ import annotations

from typing import Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

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
