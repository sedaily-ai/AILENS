"""CMS 글 공개 조회 — 상시 서버 버전 (v1.20).

handlers/cms_posts_public.py(Lambda)와 계약 동일:
  GET /api/v2/posts?channel=...&date=...&limit=...
  GET /api/v2/posts/{slug}?channel=...

Lambda 버전과의 차이는 순수 인프라 계층뿐(커넥션 풀 재사용, VPC 내
상시 프로세스) — 쿼리·shaping 로직은 그대로 포팅했다.
"""
from __future__ import annotations

import json
import threading
import time
from typing import Dict, Optional

from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response

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
    allow_headers=["Content-Type", "Authorization", "X-Voter-Id"],  # X-Voter-Id: 레터 투표·관심 설정의 기기 식별자(다른 주소에서 호출할 때 사전 확인 요청이 통과해야 한다)
)

_LIST_SHAPERS = {
    **SHAPERS,
    "lens": shape_lens_summary,
    "webtoon": shape_webtoon_summary,
    "home_player": shape_home_player_summary,
}
_VALID_CHANNELS = ("letters", "paper", "feed", "webtoon", "video", "lens", "home_player")
_CACHE_CONTROL = "no-store"

# 목록 응답(1,000건이면 ~3MB)은 봇·SSR 재검증이 몰리면 같은 쿼리와 직렬화를 반복한다. 워커 프로세스 안에서 직렬화된 JSON을 5초만 보관해
# 같은 순간의 중복 요청을 한 번의 쿼리로 합친다. 5초면 발행 직후 반영이 눈에 띄게 늦지 않고(프론트 webhook이 곧바로 다시 읽어도 안전),
# admin 쓰기(POST/PUT/DELETE)가 이 워커로 오면 즉시 비운다. 워커가 둘이라 다른 워커는 최대 5초 오래된 목록을 줄 수 있다.
_LIST_CACHE_TTL = 5.0
_LIST_CACHE_MAX_KEYS = 64
_list_cache: Dict[tuple, tuple] = {}
_list_cache_lock = threading.Lock()
_list_key_locks: Dict[tuple, threading.Lock] = {}


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
    key = (channel, date, limit)
    body = _list_cache_get(key)
    if body is None:
        # 같은 키가 동시에 만료돼도 쿼리는 한 번만 돈다(나머지는 앞선 요청이 채울 때까지 기다렸다 캐시를 읽는다).
        with _list_cache_lock:
            key_lock = _list_key_locks.setdefault(key, threading.Lock())
        with key_lock:
            body = _list_cache_get(key)
            if body is None:
                rows = posts_client.list_published_posts(channel, date, limit=limit)
                payload = {
                    "channel": channel,
                    "date": date,
                    "posts": [_LIST_SHAPERS[channel](r) for r in rows],
                }
                body = json.dumps(payload, ensure_ascii=False, separators=(",", ":"), default=str).encode("utf-8")
                _list_cache_put(key, body)
    return Response(content=body, media_type="application/json", headers={"Cache-Control": _CACHE_CONTROL})


def _list_cache_get(key: tuple) -> Optional[bytes]:
    hit = _list_cache.get(key)
    if hit and time.monotonic() - hit[0] < _LIST_CACHE_TTL:
        return hit[1]
    return None


def _list_cache_put(key: tuple, body: bytes) -> None:
    with _list_cache_lock:
        if len(_list_cache) >= _LIST_CACHE_MAX_KEYS:
            _list_cache.clear()
        _list_cache[key] = (time.monotonic(), body)


@app.middleware("http")
async def _invalidate_list_cache_on_write(request, call_next):
    response = await call_next(request)
    if request.method in ("POST", "PUT", "DELETE", "PATCH"):
        with _list_cache_lock:
            _list_cache.clear()
    return response


# 라우트 모듈(분리 전 main.py 순서 유지: 같은 모듈 안에서는 선언 순서가 매칭 우선순위다)
import routes_admin_posts
import routes_pipeline_state
import routes_letters
import routes_quiz
import routes_users
import routes_articles
import routes_community
import routes_prompts
import routes_chat_threads
import routes_ops

app.include_router(routes_admin_posts.router)
app.include_router(routes_pipeline_state.router)
app.include_router(routes_letters.router)
app.include_router(routes_quiz.router)
app.include_router(routes_users.router)
app.include_router(routes_articles.router)
app.include_router(routes_community.router)
app.include_router(routes_prompts.router)
app.include_router(routes_chat_threads.router)
app.include_router(routes_ops.router)
