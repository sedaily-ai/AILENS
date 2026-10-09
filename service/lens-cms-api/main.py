"""CMS 글 공개 조회 — 상시 서버 버전 (v1.20).

handlers/cms_posts_public.py(Lambda)와 계약 동일:
  GET /api/v2/posts?channel=...&date=...&limit=...
  GET /api/v2/posts/{slug}?channel=...

Lambda 버전과의 차이는 순수 인프라 계층뿐(커넥션 풀 재사용, VPC 내
상시 프로세스) — 쿼리·shaping 로직은 그대로 포팅했다.
"""
from __future__ import annotations

import json
import os
import threading
import time
from typing import Any, Dict, Optional

from fastapi import Body, FastAPI, Header, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response

import admin_posts_repo
import articles_repo
import audit_repo
import chat_threads_repo
import cms_posts_repo as posts_client
import community_repo
import config_repo
import personal_repo
import prompt_lab_repo
import prompts_repo
import quiz_repo
import selection_repo
import subscribers_repo
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


# 2026-09-25 — 프롬프트 실험(챗랩) 백엔드 CRUD 점검 중 추가. admin/backend/
# routes/posts.py::_MAX_PAYLOAD_BYTES(340KB, CMS 글 본문 기준)와 같은
# 원칙 — 크기 제한이 아예 없는 텍스트/JSONB 필드가 2026-09-25 admin/posts
# 413(payload too large)의 원인이었다(목록 조회가 이 무제한 필드를 그대로
# 실어 보내서). 그 사고를 겪은 필드(prompt_lab_thread_messages.payload)와
# 같은 패턴(대화 메시지·프롬프트 실험 파일)에 선제적으로 상한을 건다 —
# 아직 이 필드들에서 같은 사고가 난 적은 없지만 구조가 동일하다.
_MAX_TEXT_FIELD_BYTES = 200 * 1024


def _check_field_size(value: str, field_name: str) -> None:
    size = len(value.encode("utf-8"))
    if size > _MAX_TEXT_FIELD_BYTES:
        raise HTTPException(
            status_code=400,
            detail=f"{field_name} too large: {size} bytes (max {_MAX_TEXT_FIELD_BYTES})",
        )


@app.post("/admin/posts")
def admin_create_post(payload: Dict[str, Any] = Body(...), x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    data = payload.get("data") or {}
    created_by = payload.get("created_by", "admin")
    return {"post": admin_posts_repo.create(data, created_by)}


@app.get("/admin/posts/by-source-url")
def admin_find_post_by_source_url(source_url: str = Query(...), x_internal_token: Optional[str] = Header(default=None)):
    # 자동 파이프라인(frontpage_auto/mustknow_auto) 중복 발행 방지 — v1.32.
    # list_posts()는 admin_post_id IS NOT NULL 제한이 있어 v1.4 이관 글을
    # 못 찾는다. 여기는 그 제한 없이 source_url 정확히 일치만 본다.
    _check_admin_token(x_internal_token)
    return {"post": admin_posts_repo.find_by_source_url(source_url)}


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
def admin_get_post(
    post_id: str,
    channel: Optional[str] = Query(default=None),
    x_internal_token: Optional[str] = Header(default=None),
):
    _check_admin_token(x_internal_token)
    # channel — 2026-09-11, 웹툰/영상/홈플레이어 편집 화면이 자기 채널을
    # 실어 보내면 lens 번들 글의 body_inline을 그 포맷에 맞게 평평한
    # 모양으로 얹어 받는다(admin_posts_repo._to_dict 참조).
    post = admin_posts_repo.get(post_id, view_channel=channel)
    if not post:
        raise HTTPException(status_code=404, detail="post not found")
    return {"post": post}


@app.put("/admin/posts/{post_id}")
def admin_update_post(
    post_id: str,
    channel: Optional[str] = Query(default=None),
    data: Dict[str, Any] = Body(...),
    x_internal_token: Optional[str] = Header(default=None),
):
    _check_admin_token(x_internal_token)
    # channel — 2026-09-11, 웹툰/영상/홈플레이어 편집기가 자기 채널을
    # 실어 보내면 lens 번들의 그 포맷 슬라이스만 스코프해서 저장한다
    # (admin_posts_repo.update/_update_lens_bundle_slice 참조).
    try:
        post = admin_posts_repo.update(post_id, data, edit_channel=channel)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
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


@app.post("/admin/posts/soft-delete-by-slug")
def admin_soft_delete_by_slug(payload: Dict[str, Any] = Body(...), x_internal_token: Optional[str] = Header(default=None)):
    # admin_post_id가 없는 옛 글(테스트 글 등)은 아래 DELETE /admin/posts/{id}로 못 지운다(2026-10-09).
    # dry_run 기본값이 true라 body에 dry_run:false를 명시해야만 실제로 지운다. 조건이 하나라도 어긋나면 409로 아무것도 바꾸지 않는다.
    _check_admin_token(x_internal_token)
    slugs = payload.get("slugs")
    if not isinstance(slugs, list) or not all(isinstance(x, str) for x in slugs):
        raise HTTPException(status_code=400, detail="slugs는 문자열 배열이어야 합니다")
    dry_run = payload.get("dry_run", True) is not False
    try:
        return admin_posts_repo.soft_delete_empty_by_slugs(slugs, dry_run=dry_run)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))


@app.post("/admin/posts/reclassify-by-slug")
def admin_reclassify_by_slug(payload: Dict[str, Any] = Body(...), x_internal_token: Optional[str] = Header(default=None)):
    # 분류 개편(2026-10-09) 일괄 재분류. 관리자 PUT은 admin_post_id가 있는 글(공개 글의 약 62%)만 다뤄서, 8월 글 등 나머지를 같은 방식으로 바꾸려고 slug 기준으로 둔다.
    # dry_run 기본값이 true라 body에 dry_run:false를 명시해야 실제로 바꾼다. 조건이 어긋나면 409로 아무것도 바꾸지 않는다.
    _check_admin_token(x_internal_token)
    items = payload.get("items")
    if not isinstance(items, list) or not all(isinstance(x, dict) for x in items):
        raise HTTPException(status_code=400, detail="items는 객체 배열이어야 합니다")
    dry_run = payload.get("dry_run", True) is not False
    try:
        return admin_posts_repo.reclassify_by_slugs(items, dry_run=dry_run)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))


@app.delete("/admin/posts/{post_id}")
def admin_delete_post(post_id: str, x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    if not admin_posts_repo.soft_delete(post_id):
        raise HTTPException(status_code=404, detail="post not found")
    return {"ok": True}


# ── 선정 실험실 — v1.35 ────────────────────────────────────────────
# mustknow_auto "일반" 카테고리 선정 결과를 날짜별로 모아 팀원이 적절/
# 애매/부적절로 채점하는 admin 화면. /internal/selection-runs는
# pipelines/mustknow_auto/run.py가 매 회차 직후 호출(하루 여러 번).
@app.post("/internal/selection-runs")
def internal_create_selection_run(
    payload: Dict[str, Any] = Body(...),
    x_internal_token: Optional[str] = Header(default=None),
):
    _check_admin_token(x_internal_token)
    return selection_repo.create_run(
        run_date=payload["run_date"],
        category=payload.get("category", "general"),
        today_context=payload.get("today_context"),
        candidates_total=payload.get("candidates_total", 0),
        excluded_count=payload.get("excluded_count", 0),
        excluded_reasons=payload.get("excluded_reasons") or [],
        selected=payload.get("selected") or [],
    )


@app.get("/admin/selection-runs/dates")
def admin_selection_run_dates(
    category: str = Query(default="general"),
    limit: int = Query(default=30),
    x_internal_token: Optional[str] = Header(default=None),
):
    _check_admin_token(x_internal_token)
    return {"dates": selection_repo.list_dates(category, limit)}


@app.get("/admin/selection-runs")
def admin_selection_run_day(
    date: str = Query(...),
    category: str = Query(default="general"),
    x_internal_token: Optional[str] = Header(default=None),
):
    _check_admin_token(x_internal_token)
    return selection_repo.get_day(date, category)


@app.patch("/admin/selection-articles/{article_id}/score")
def admin_score_selection_article(
    article_id: int,
    payload: Dict[str, Any] = Body(...),
    x_internal_token: Optional[str] = Header(default=None),
):
    _check_admin_token(x_internal_token)
    try:
        article = selection_repo.score_article(
            article_id,
            payload.get("verdict"),
            payload.get("note"),
            payload.get("scored_by", "admin"),
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not article:
        raise HTTPException(status_code=404, detail="article not found")
    return {"article": article}


# ── 용어 퀴즈 — v1.22, 응답 집계는 v1.26 ─────────────────────────────
@app.get("/api/quiz/today")
def quiz_today(limit: int = Query(default=4)):
    return {"quizzes": quiz_repo.list_published_quizzes(limit=limit)}


@app.post("/internal/quiz/attempt")
def internal_quiz_attempt(payload: Dict[str, Any] = Body(...), x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    ok = quiz_repo.record_attempt(payload["quiz_id"], bool(payload.get("correct")))
    if not ok:
        raise HTTPException(status_code=404, detail="quiz not found")
    return {"ok": True}


@app.post("/admin/quizzes")
def admin_create_quiz(payload: Dict[str, Any] = Body(...), x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    data = payload.get("data") or {}
    created_by = payload.get("created_by", "admin")
    return {"quiz": quiz_repo.create(data, created_by)}


@app.get("/admin/quizzes")
def admin_list_quiz(
    status: Optional[str] = Query(default=None),
    limit: int = Query(default=50),
    x_internal_token: Optional[str] = Header(default=None),
):
    _check_admin_token(x_internal_token)
    limit = max(1, min(limit, 200))
    quizzes = quiz_repo.list_quiz(status, limit)
    return {"quizzes": quizzes, "count": len(quizzes)}


@app.get("/admin/quizzes/{quiz_id}")
def admin_get_quiz(quiz_id: str, x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    quiz = quiz_repo.get(quiz_id)
    if not quiz:
        raise HTTPException(status_code=404, detail="quiz not found")
    return {"quiz": quiz}


@app.put("/admin/quizzes/{quiz_id}")
def admin_update_quiz(quiz_id: str, data: Dict[str, Any] = Body(...), x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    quiz = quiz_repo.update(quiz_id, data)
    if not quiz:
        raise HTTPException(status_code=404, detail="quiz not found")
    return {"quiz": quiz}


@app.post("/admin/quizzes/{quiz_id}/status")
def admin_set_quiz_status(quiz_id: str, payload: Dict[str, Any] = Body(...), x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    status = payload.get("status", "")
    try:
        quiz = quiz_repo.set_status(quiz_id, status)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    if not quiz:
        raise HTTPException(status_code=404, detail="quiz not found")
    return {"quiz": quiz}


@app.delete("/admin/quizzes/{quiz_id}")
def admin_delete_quiz(quiz_id: str, x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    if not quiz_repo.soft_delete(quiz_id):
        raise HTTPException(status_code=404, detail="quiz not found")
    return {"ok": True}


# ── 뉴스레터 구독자 — v1.23 ────────────────────────────────────────────
# 공개 HTTP 표면(검증·CAN-SPAM consent 체크·SES 발송)은 여전히 기존
# Lambda(handlers/subscribe.py)가 담당한다 — 저장 계층만 여기로 옮겼다.
# 그래서 이 라우터들은 전부 내부 전용(공개 노출 안 함), 공유 시크릿으로
# 보호한다.
@app.post("/internal/subscriptions")
def internal_subscribe(payload: Dict[str, Any] = Body(...), x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    sub = subscribers_repo.subscribe(
        payload["email"], bool(payload.get("consent", True)),
        name=payload.get("name"),
        onboarding_format=payload.get("onboarding_format"),
        onboarding_interests=payload.get("onboarding_interests"),
        newsletter_id=payload.get("newsletter_id", 1),
    )
    return {"subscriber": sub}


@app.post("/internal/subscriptions/unsubscribe")
def internal_unsubscribe(payload: Dict[str, Any] = Body(...), x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    return {"ok": subscribers_repo.unsubscribe_by_token(payload["token"])}


@app.get("/internal/subscriptions")
def internal_list_subscriptions(
    active_only: bool = Query(default=False),
    newsletter_id: int = Query(default=1),
    x_internal_token: Optional[str] = Header(default=None),
):
    _check_admin_token(x_internal_token)
    if active_only:
        return {"subscribers": subscribers_repo.list_active_subscribers(newsletter_id)}
    return {"subscribers": subscribers_repo.list_all()}


# ── 개인화(내 서랍·읽은 기록·프로필) — v1.24 ────────────────────────────
# 스트릭·뱃지 계산 등 비즈니스 로직은 그대로 service/backend/services/
# user_service.py에 남는다 — 여기는 순수 저장 primitive만.
@app.post("/internal/personal/archives")
def internal_save_archive(payload: Dict[str, Any] = Body(...), x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    return {"archive": personal_repo.save_archived_sentence(
        payload["user_id"], payload["text"],
        article_no=payload.get("article_no"), rendition_id=payload.get("rendition_id"),
    )}


@app.delete("/internal/personal/archives/{archive_id}")
def internal_delete_archive(archive_id: str, user_id: str = Query(...), x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    return {"ok": personal_repo.delete_archived_sentence(user_id, archive_id)}


@app.get("/internal/personal/archives")
def internal_list_archives(
    user_id: str = Query(...),
    date_from: Optional[str] = Query(default=None),
    date_to: Optional[str] = Query(default=None),
    limit: int = Query(default=100),
    x_internal_token: Optional[str] = Header(default=None),
):
    _check_admin_token(x_internal_token)
    return {"archives": personal_repo.list_archived_sentences(user_id, date_from, date_to, limit)}


@app.get("/internal/personal/archives/popular")
def internal_popular_archives(x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    return {"archives": personal_repo.list_popular_archived_sentences()}


@app.get("/internal/personal/users/{user_id}")
def internal_get_user(user_id: str, x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    profile = personal_repo.get_user_profile(user_id)
    if not profile:
        raise HTTPException(status_code=404, detail="user not found")
    return {"user": profile}


@app.post("/internal/personal/users/{user_id}")
def internal_get_or_create_user(user_id: str, payload: Dict[str, Any] = Body(default={}), x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    return {"user": personal_repo.get_or_create_user(
        user_id, email=payload.get("email"), name=payload.get("name"), picture=payload.get("picture"),
    )}


@app.put("/internal/personal/users/{user_id}")
def internal_update_user(user_id: str, updates: Dict[str, Any] = Body(...), x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    profile = personal_repo.update_user_profile(user_id, updates)
    if not profile:
        raise HTTPException(status_code=404, detail="user not found")
    return {"user": profile}


@app.post("/internal/personal/readings")
def internal_save_reading(payload: Dict[str, Any] = Body(...), x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    try:
        return {"reading": personal_repo.save_reading_record(
            payload["user_id"], article_no=payload.get("article_no"),
            publication_id=payload.get("publication_id"),
        )}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.get("/internal/personal/readings")
def internal_list_readings(user_id: str = Query(...), limit: int = Query(default=50), x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    return {"readings": personal_repo.list_reading_history(user_id, limit)}


# --- articles (v1.25) ---
# 공개 조회는 article-dev/search-dev/chatbot-dev/question-dev Lambda가 호출,
# 인증 불필요(기존 DynamoDB 경로도 공개 API였음). 수집기(article-collector-dev)
# 쓰기 경로만 내부 토큰으로 보호.

@app.get("/api/v2/articles/{article_no}")
def get_article(article_no: str):
    article = articles_repo.get_article(article_no)
    if not article:
        raise HTTPException(status_code=404, detail="not found")
    return {"article": article}


@app.get("/api/v2/articles")
def list_articles(
    date: Optional[str] = Query(default=None, description="YYYYMMDD"),
    category: Optional[str] = Query(default=None),
    categories: Optional[str] = Query(default=None, description="comma-separated"),
    keyword: Optional[str] = Query(default=None),
    days: Optional[int] = Query(default=None),
    limit: int = Query(default=30),
):
    if date:
        return {"articles": articles_repo.list_articles_by_date(date, limit)}
    if category and not categories:
        return {"articles": articles_repo.get_recent_articles(category, limit)}
    cat_list = categories.split(",") if categories else None
    return {"articles": articles_repo.search_articles(cat_list, keyword, days, limit)}


@app.post("/internal/articles/exists")
def internal_articles_exists(payload: Dict[str, Any] = Body(...), x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    return {"existing": articles_repo.batch_check_exists(payload.get("article_nos") or [])}


@app.post("/internal/articles/hashes")
def internal_articles_hashes(payload: Dict[str, Any] = Body(...), x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    return {"hashes": articles_repo.batch_get_hash(payload.get("article_nos") or [])}


@app.put("/internal/articles/{article_no}")
def internal_save_article(article_no: str, payload: Dict[str, Any] = Body(...), x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    payload["news_id"] = article_no
    articles_repo.save_article(payload)
    return {"ok": True}


# --- community 게시판 (v1.26) ---
# 목록/댓글 조회는 원본 DynamoDB 핸들러도 인증 없는 공개 GET이었다(post_handler.py
# 참조 — POST만 JWT 필요). 글쓰기/투표/댓글 작성은 user_id가 Lambda 쪽에서
# 이미 JWT로 검증된 값이라는 전제로 내부 토큰 라우트에 그대로 전달받는다.

@app.get("/api/v2/community/posts")
def community_list_posts(
    date: str = Query(...),
    limit: int = Query(default=30),
    tag: Optional[str] = Query(default=None),
):
    return {"posts": community_repo.list_posts(date, limit, tag)}


@app.get("/api/v2/community/posts/{post_id}/comments")
def community_list_comments(post_id: int, limit: int = Query(default=50)):
    return {"comments": community_repo.list_comments(post_id, limit)}


@app.post("/internal/community/posts")
def internal_community_create_post(payload: Dict[str, Any] = Body(...), x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    post = community_repo.create_post(
        user_id=payload["user_id"],
        user_name=payload.get("user_name"),
        user_avatar=payload.get("user_avatar"),
        archived_sentence=payload["archived_sentence"],
        user_comment=payload.get("user_comment"),
        article_id=payload.get("article_id"),
        tags=payload.get("tags"),
    )
    return {"post": post}


@app.post("/internal/community/posts/{post_id}/vote")
def internal_community_vote(post_id: int, payload: Dict[str, Any] = Body(...), x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    delta = community_repo.vote_post(post_id, payload["user_id"], payload.get("vote_type", "up"))
    if delta is None:
        raise HTTPException(status_code=404, detail="post not found")
    return {"post_id": post_id, "vote_type": payload.get("vote_type", "up"), "delta": delta}


@app.post("/internal/community/posts/{post_id}/comments")
def internal_community_add_comment(post_id: int, payload: Dict[str, Any] = Body(...), x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    comment = community_repo.add_comment(
        post_id, payload["user_id"], payload.get("user_name"), payload.get("user_avatar"), payload["text"],
    )
    if comment is None:
        raise HTTPException(status_code=404, detail="post not found")
    return {"comment": comment}


# --- admin 프롬프트 (v1.27) ---
# 공개 조회는 service/backend/services/prompt_loader.py, pipelines/common/
# ddb_prompt.py 둘 다 사용 — 원래 DynamoDB GetItem도 무인증(같은 Lambda
# 실행 역할 안이었을 뿐)이었다. 나머지(목록/버전이력/수정)는 admin 전용.

@app.get("/api/v2/prompts/{category}/{name}")
def get_prompt_content(category: str, name: str):
    content = prompts_repo.get_active_content(category, name)
    if content is None:
        raise HTTPException(status_code=404, detail="prompt not found")
    return {"content": content}


@app.get("/internal/admin/prompts")
def internal_list_prompts(x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    return {"prompts": prompts_repo.list_prompts()}


@app.get("/internal/admin/prompts/{category}/{name}")
def internal_get_prompt(category: str, name: str, x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    prompt = prompts_repo.get_prompt(category, name)
    if not prompt:
        raise HTTPException(status_code=404, detail="prompt not found")
    return prompt


@app.get("/internal/admin/prompts/{category}/{name}/history")
def internal_get_prompt_history(category: str, name: str, x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    return {"history": prompts_repo.get_prompt_history(category, name)}


@app.get("/internal/admin/prompts/{category}/{name}/versions/{version}")
def internal_get_prompt_version(category: str, name: str, version: int, x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    v = prompts_repo.get_prompt_version(category, name, version)
    if not v:
        raise HTTPException(status_code=404, detail="prompt version not found")
    return v


@app.put("/internal/admin/prompts/{category}/{name}")
def internal_update_prompt(category: str, name: str, payload: Dict[str, Any] = Body(...), x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    content = payload.get("content", "")
    if not content:
        raise HTTPException(status_code=400, detail="content required")
    _check_field_size(content, "content")
    activate = payload.get("activate", True)
    result = prompts_repo.update_prompt(category, name, content, sections=payload.get("sections"), activate=activate)
    return result


@app.post("/internal/admin/prompts/{category}/{name}/activate")
def internal_activate_prompt_version(category: str, name: str, payload: Dict[str, Any] = Body(...), x_internal_token: Optional[str] = Header(default=None)):
    """update_prompt(activate=False)로 저장해둔 버전을 프로덕션 활성값으로
    승격한다 — 새 버전을 안 만들고 is_active만 옮긴다(2026-09-26 신설).

    prompt_lab_docs/files(관리자 화면의 편집 가능한 초안, "프로덕션" 카드가
    보여주는 값)도 같이 맞춘다 — 안 그러면 "테스트 카드가 만든 버전을
    활성화"했는데 프로덕션 카드의 설명/지침/파일 칸은 예전 초안을 그대로
    보여주는 채로 남아서, 사용자가 거기서 무심코 "발행"을 다시 누르면 방금
    활성화한 내용을 예전 초안으로 덮어써버리는 함정이 생긴다. sections가
    이 챗랩이 만든 모양({kind: "prompt_lab", ...})일 때만 동기화한다 — 그
    이전 방식(PromptDrawer)으로 만들어진 버전은 애초에 이 화면과 무관한
    설명/지침/파일 구조가 없어 손대지 않는다."""
    _check_admin_token(x_internal_token)
    version = payload.get("version")
    if not isinstance(version, int):
        raise HTTPException(status_code=400, detail="version (int) required")
    result = prompts_repo.activate_version(category, name, version)
    if result is None:
        raise HTTPException(status_code=404, detail="prompt version not found")

    v = prompts_repo.get_prompt_version(category, name, version)
    sections = (v or {}).get("sections") or {}
    if isinstance(sections, dict) and sections.get("kind") == "prompt_lab":
        prompt_lab_repo.update_description(category, name, sections.get("description") or "")
        prompt_lab_repo.update_instructions(category, name, sections.get("instructions") or "")
        doc = prompt_lab_repo.get_doc(category, name)
        for f in doc["files"]:
            prompt_lab_repo.delete_file(f["id"])
        for f in sections.get("files") or []:
            if isinstance(f, dict):
                prompt_lab_repo.create_file(category, name, f.get("name") or "이름 없음", f.get("content") or "")

    return result


@app.delete("/internal/admin/prompts/{category}/{name}/versions/{version}")
def internal_delete_prompt_version(category: str, name: str, version: int, x_internal_token: Optional[str] = Header(default=None)):
    """버전 하나를 완전히 삭제한다(2026-09-26 신설, 사용자 요청: "버전을
    삭제하는 방법도 있어야 할 것 같고"). 활성(프로덕션) 버전은 400으로
    거부 — prompts_repo.delete_version 참고."""
    _check_admin_token(x_internal_token)
    result = prompts_repo.delete_version(category, name, version)
    if result is None:
        raise HTTPException(status_code=404, detail="prompt version not found")
    if not result.get("deleted"):
        raise HTTPException(
            status_code=400,
            detail="지금 프로덕션에서 쓰이는 버전은 삭제할 수 없습니다 — 다른 버전을 먼저 적용한 뒤 삭제해 주세요.",
        )
    return result


@app.patch("/internal/admin/prompts/{category}/{name}/versions/{version}/label")
def internal_rename_prompt_version(category: str, name: str, version: int, payload: Dict[str, Any] = Body(...), x_internal_token: Optional[str] = Header(default=None)):
    """버전 번호·content는 그대로 두고 이름표(sections.label)만 바꾼다 —
    2026-09-26 신설, 사용자 지적: "버전이름도 수정가능하게 해야합니다".
    prompts_repo.rename_version 참고."""
    _check_admin_token(x_internal_token)
    label = payload.get("label")
    if not isinstance(label, str):
        raise HTTPException(status_code=400, detail="label (string) required")
    result = prompts_repo.rename_version(category, name, version, label)
    if result is None:
        raise HTTPException(status_code=404, detail="prompt version not found")
    return result


# --- 프롬프트 실험 챗랩: 설명/지침/파일 개별 저장 (2026-09-15) ---
# prompt_lab_repo.py 모듈 docstring 참고 — prompts_repo(프로덕션 버전
# 스냅샷)와는 별개 저장소, "발행"만 그쪽을 조립해서 부른다.
# (이 파일의 "v1.X" 섹션 버전 태그는 v1.28(줄 696 근방) 이후로는 안 붙여왔다 —
# 맨 위 모듈 docstring도 v1.20에 멈춰있는 등 이 파일 자체에서도 v1.29+ 구간은
# 비공식적으로 날짜만 남기는 쪽으로 굳어진 상태. 여기서 새로 번호를 매기지
# 않고 그 관례를 따른다.)

@app.get("/internal/admin/prompt-lab/{category}/{name}")
def internal_get_prompt_lab_doc(category: str, name: str, x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    return prompt_lab_repo.get_doc(category, name)


@app.put("/internal/admin/prompt-lab/{category}/{name}/description")
def internal_update_lab_description(category: str, name: str, payload: Dict[str, Any] = Body(...), x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    text = payload.get("text") or ""
    _check_field_size(text, "description")
    return prompt_lab_repo.update_description(category, name, text)


@app.put("/internal/admin/prompt-lab/{category}/{name}/instructions")
def internal_update_lab_instructions(category: str, name: str, payload: Dict[str, Any] = Body(...), x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    text = payload.get("text") or ""
    _check_field_size(text, "instructions")
    return prompt_lab_repo.update_instructions(category, name, text)


@app.post("/internal/admin/prompt-lab/{category}/{name}/files")
def internal_create_lab_file(category: str, name: str, payload: Dict[str, Any] = Body(...), x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    file_name = (payload.get("name") or "").strip() or "이름 없음"
    content = payload.get("content") or ""
    _check_field_size(content, "content")
    return prompt_lab_repo.create_file(category, name, file_name, content)


@app.get("/internal/admin/prompt-lab/{category}/{name}/files/{file_id}")
def internal_get_lab_file(category: str, name: str, file_id: int, x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    f = prompt_lab_repo.get_file_content(file_id)
    if not f:
        raise HTTPException(status_code=404, detail="file not found")
    return f


@app.put("/internal/admin/prompt-lab/{category}/{name}/files/{file_id}")
def internal_update_lab_file(category: str, name: str, file_id: int, payload: Dict[str, Any] = Body(...), x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    # update_file()은 name/content 둘 다 없을 때도 None을 돌려준다(파일이
    # 실제로 없는 경우와 같은 신호) — "수정할 내용 없음"과 "파일 없음"을
    # 여기서 먼저 구분해야 전자를 404로 잘못 응답하지 않는다.
    if payload.get("name") is None and payload.get("content") is None:
        raise HTTPException(status_code=400, detail="name or content required")
    if payload.get("content") is not None:
        _check_field_size(payload["content"], "content")
    r = prompt_lab_repo.update_file(file_id, payload.get("name"), payload.get("content"))
    if r is None:
        raise HTTPException(status_code=404, detail="file not found")
    return r


@app.delete("/internal/admin/prompt-lab/{category}/{name}/files/{file_id}")
def internal_delete_lab_file(category: str, name: str, file_id: int, x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    if not prompt_lab_repo.delete_file(file_id):
        raise HTTPException(status_code=404, detail="file not found")
    return {"deleted": True}


@app.post("/internal/admin/prompt-lab/{category}/{name}/publish")
def internal_publish_prompt_lab(category: str, name: str, x_internal_token: Optional[str] = Header(default=None)):
    """설명+지침+파일을 조립해 prompts_repo에 새 프로덕션 버전으로 발행한다
    — admin/backend가 조립 로직 없이 그대로 위임할 수 있게 서버 쪽에서
    한 번에 처리한다(프론트가 들고 있던 조립 문자열을 다시 그대로
    쏴주는 것보다, 서버가 지금 저장된 desc/instructions/files를 정본으로
    다시 조립하는 편이 "화면에 아직 저장 안 한 편집 중 내용"이 실수로
    발행되는 걸 막는다).

    2026-09-26 — sections에 조립 전 원본 구조(설명/지침/파일 분리)도 같이
    남긴다(사용자 지적: 테스트 카드의 "생성 프롬프트" 참조가 프로덕션
    패널과 다른 구조라 헷갈림 — 프론트가 이 버전을 다시 볼 때 flattened
    content 대신 이 구조를 그대로 재현해서 프로덕션과 동일하게 보여준다).
    /prompts/edit(PromptDrawer)의 sections(PromptSectionKey="content" 형태)
    와는 필드 모양이 다르다 — 같은 컬럼이지만 카테고리별로 어느 편집기가
    발행했는지에 따라 다른 모양이 들어가는 건 이미 sections가 unknown
    타입(lib/types.ts::PromptDetail.sections)으로 다뤄지고 있어서 문제
    없다."""
    _check_admin_token(x_internal_token)
    doc = prompt_lab_repo.get_doc(category, name)
    parts = []
    if doc["description"].strip():
        parts.append(doc["description"].strip())
    if doc["instructions"].strip():
        parts.append(doc["instructions"].strip())
    lab_files = []
    for meta in doc["files"]:
        full = prompt_lab_repo.get_file_content(meta["id"])
        if full and full["content"].strip():
            parts.append(f"### 파일 · {full['name']}\n\n{full['content'].strip()}")
            lab_files.append({"name": full["name"], "content": full["content"]})
    content = "\n\n".join(parts)
    if not content:
        raise HTTPException(status_code=400, detail="empty prompt — nothing to publish")
    sections = {
        "kind": "prompt_lab",
        "description": doc["description"],
        "instructions": doc["instructions"],
        "files": lab_files,
    }
    return prompts_repo.update_prompt(category, name, content, sections=sections)


# --- 프롬프트 실험 챗랩: 대화 스레드/메시지 (2026-09-15) ---
# chat_threads_repo.py 모듈 docstring 참고 — 순수 대화 기록 저장소.
# (버전 태그 생략 이유는 위 프롬프트 실험 챗랩 섹션 주석 참고.)

@app.post("/internal/admin/chat-threads")
def internal_create_chat_thread(payload: Dict[str, Any] = Body(...), x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    category = payload.get("category") or ""
    name = payload.get("name") or ""
    if not category or not name:
        raise HTTPException(status_code=400, detail="category and name required")
    return chat_threads_repo.create_thread(category, name, payload.get("title") or "")


@app.get("/internal/admin/chat-threads")
def internal_list_chat_threads(category: str = Query(...), name: str = Query(...), x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    return {"threads": chat_threads_repo.list_threads(category, name)}


@app.get("/internal/admin/chat-threads/{thread_id}")
def internal_get_chat_thread(
    thread_id: int,
    before_id: Optional[int] = Query(default=None),
    x_internal_token: Optional[str] = Header(default=None),
):
    _check_admin_token(x_internal_token)
    thread = chat_threads_repo.get_thread(thread_id, before_id=before_id)
    if not thread:
        raise HTTPException(status_code=404, detail="thread not found")
    return thread


@app.get("/internal/admin/chat-threads/{thread_id}/media-keys")
def internal_list_chat_thread_media_keys(thread_id: int, x_internal_token: Optional[str] = Header(default=None)):
    """2026-09-25 — delete_thread()가 S3 정리를 안 하는 문제 수정의
    일부(chat_threads_repo.list_media_keys() docstring 참고). admin
    Lambda가 스레드 삭제 직전에 이걸 불러 지울 S3 키 목록을 받는다."""
    _check_admin_token(x_internal_token)
    cur = chat_threads_repo.get_thread(thread_id, message_limit=1)
    if cur is None:
        raise HTTPException(status_code=404, detail="thread not found")
    return {"keys": chat_threads_repo.list_media_keys(thread_id)}


@app.post("/internal/admin/chat-threads/{thread_id}/messages")
def internal_append_chat_message(thread_id: int, payload: Dict[str, Any] = Body(...), x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    role = payload.get("role")
    if role not in ("user", "assistant"):
        raise HTTPException(status_code=400, detail="role must be user or assistant")
    message_payload = payload.get("payload") or {}
    _check_field_size(json.dumps(message_payload, ensure_ascii=False), "payload")
    result = chat_threads_repo.append_message(thread_id, role, message_payload)
    if result is None:
        raise HTTPException(status_code=404, detail="thread not found")
    return result


@app.put("/internal/admin/chat-threads/{thread_id}")
def internal_update_chat_thread(thread_id: int, payload: Dict[str, Any] = Body(...), x_internal_token: Optional[str] = Header(default=None)):
    """title(이름 변경)·tag(이모지 태그) 둘 다 이 PUT 하나로 처리한다 —
    2026-09-26 tag 추가 전엔 title 하나뿐이라 필수값이었지만, 이제 어느
    쪽이든 하나만 와도 된다(둘 다 없으면 400). tag는 "tag" 키가 payload에
    있는지로 판단한다(None 값 자체가 "태그 해제"라는 유효한 요청이라
    `payload.get("tag")`만으로는 "안 보냄"과 "해제"를 구분 못 한다)."""
    _check_admin_token(x_internal_token)
    title = payload.get("title")
    has_tag = "tag" in payload
    tag = payload.get("tag")
    if title is None and not has_tag:
        raise HTTPException(status_code=400, detail="title or tag required")
    updated = False
    if title is not None:
        updated = chat_threads_repo.update_thread_title(thread_id, title) or updated
    if has_tag:
        updated = chat_threads_repo.set_thread_tag(thread_id, tag) or updated
    if not updated:
        raise HTTPException(status_code=404, detail="thread not found")
    return {"updated": True}


@app.delete("/internal/admin/chat-threads/{thread_id}")
def internal_delete_chat_thread(thread_id: int, x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    if not chat_threads_repo.delete_thread(thread_id):
        raise HTTPException(status_code=404, detail="thread not found")
    return {"deleted": True}


# --- 감사 로그 (v1.27) ---

@app.post("/internal/audit/log")
def internal_audit_log(payload: Dict[str, Any] = Body(...), x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    audit_repo.log_event(
        action=payload["action"],
        detail=payload.get("detail"),
        actor=payload.get("actor", "admin"),
        session_id=payload.get("session"),
        source_ip=payload.get("source_ip"),
    )
    return {"ok": True}


@app.get("/internal/audit")
def internal_audit_list(
    limit: int = Query(default=50),
    cursor: Optional[str] = Query(default=None),
    x_internal_token: Optional[str] = Header(default=None),
):
    _check_admin_token(x_internal_token)
    limit = max(1, min(limit, 200))
    before_id = int(cursor) if cursor else None
    events, next_cursor = audit_repo.list_events(limit=limit, before_id=before_id)
    return {"audits": events, "count": len(events), "next_cursor": next_cursor}


@app.get("/internal/admin/prompts/{category}/{name}/activation-history")
def internal_prompt_activation_history(category: str, name: str, x_internal_token: Optional[str] = Header(default=None)):
    """2026-09-26 신설, 사용자 요청 — "프로덕션에 적용한 이력들도 남아야
    해요, 몇시 몇분... 날짜에 했는지". audit_repo.list_prompt_activation_history
    참고 — 새 저장소 없이 기존 audit_logs를 그대로 거른다."""
    _check_admin_token(x_internal_token)
    return {"history": audit_repo.list_prompt_activation_history(category, name)}


# --- feature flag / threshold / admin 로그인 잠금 (v1.28) ---
# 전부 내부 토큰 보호 — DynamoDB 시절도 공개 노출이 아니라 Lambda IAM
# 권한으로 막혀 있던 운영 설정값(feature flag/threshold)과 admin 로그인
# 보안 상태(lockout)라, 공개 엔드포인트로 바꾸지 않았다.

@app.get("/internal/config/feature-flags")
def internal_list_feature_flags(x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    return {"flags": config_repo.list_feature_flags()}


@app.get("/internal/config/feature-flags/{name}")
def internal_get_feature_flag(name: str, x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    return {"name": name, "enabled": config_repo.get_feature_flag(name)}


@app.put("/internal/config/feature-flags/{name}")
def internal_set_feature_flag(name: str, payload: Dict[str, Any] = Body(...), x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    updated_at = config_repo.set_feature_flag(name, bool(payload["enabled"]))
    return {"name": name, "enabled": bool(payload["enabled"]), "updated_at": updated_at}


@app.get("/internal/config/thresholds")
def internal_list_thresholds(x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    return {"thresholds": config_repo.list_thresholds()}


@app.get("/internal/config/thresholds/{name}")
def internal_get_threshold(name: str, x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    return {"name": name, "value": config_repo.get_threshold(name)}


@app.put("/internal/config/thresholds/{name}")
def internal_set_threshold(name: str, payload: Dict[str, Any] = Body(...), x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    value = int(payload["value"])
    updated_at = config_repo.set_threshold(name, value)
    return {"name": name, "value": value, "updated_at": updated_at}


@app.post("/internal/auth/lockout/check")
def internal_lockout_check(x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    return {"retry_after_seconds": config_repo.check_lockout()}


@app.post("/internal/auth/lockout/fail")
def internal_lockout_fail(payload: Dict[str, Any] = Body(...), x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    fail_count, lockout_until = config_repo.record_login_fail(
        threshold=payload.get("threshold", 5),
        lockout_minutes=payload.get("lockout_minutes", 5),
    )
    return {"fail_count": fail_count, "lockout_until": lockout_until}


@app.post("/internal/auth/lockout/reset")
def internal_lockout_reset(x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    config_repo.reset_login_fail()
    return {"ok": True}
