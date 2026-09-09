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
import articles_repo
import audit_repo
import cms_posts_repo as posts_client
import community_repo
import personal_repo
import prompts_repo
import quiz_repo
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


@app.put("/internal/admin/prompts/{category}/{name}")
def internal_update_prompt(category: str, name: str, payload: Dict[str, Any] = Body(...), x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    content = payload.get("content", "")
    if not content:
        raise HTTPException(status_code=400, detail="content required")
    result = prompts_repo.update_prompt(category, name, content, sections=payload.get("sections"))
    return result


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
