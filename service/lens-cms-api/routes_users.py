"""구독자·개인화(보관함·독서 기록) 라우트.

main.py 분리(2026-10-12 리팩토링 5단계). 경로·응답은 분리 전과 같다.
"""
from __future__ import annotations

from fastapi import APIRouter
from typing import Any, Dict, Optional
from fastapi import Body, Header, HTTPException, Query
import personal_repo
from content_resolver import DashboardError
import subscribers_repo
from route_guards import _check_admin_token

router = APIRouter()


# ── 뉴스레터 구독자 — v1.23 ────────────────────────────────────────────
# 공개 HTTP 표면(검증·CAN-SPAM consent 체크·SES 발송)은 여전히 기존
# Lambda(handlers/subscribe.py)가 담당한다 — 저장 계층만 여기로 옮겼다.
# 그래서 이 라우터들은 전부 내부 전용(공개 노출 안 함), 공유 시크릿으로
# 보호한다.
@router.post("/internal/subscriptions")
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


@router.post("/internal/subscriptions/unsubscribe")
def internal_unsubscribe(payload: Dict[str, Any] = Body(...), x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    return {"ok": subscribers_repo.unsubscribe_by_token(payload["token"])}


@router.get("/internal/subscriptions")
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
@router.post("/internal/personal/archives")
def internal_save_archive(payload: Dict[str, Any] = Body(...), x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    try:
        return {"archive": personal_repo.save_archived_sentence(
            payload["user_id"], payload["text"],
            article_no=payload.get("article_no"), rendition_id=payload.get("rendition_id"),
        )}
    except DashboardError as exc:
        raise HTTPException(exc.status, detail={"code": exc.code, "message": exc.message}) from exc


@router.delete("/internal/personal/archives/{archive_id}")
def internal_delete_archive(archive_id: str, user_id: str = Query(...), x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    try:
        return {"ok": personal_repo.delete_archived_sentence(user_id, archive_id)}
    except DashboardError as exc:
        raise HTTPException(exc.status, detail={"code":exc.code,"message":exc.message}) from exc


@router.get("/internal/personal/archives")
def internal_list_archives(
    user_id: str = Query(...),
    date_from: Optional[str] = Query(default=None),
    date_to: Optional[str] = Query(default=None),
    limit: int = Query(default=100,ge=1,le=200),
    x_internal_token: Optional[str] = Header(default=None),
):
    _check_admin_token(x_internal_token)
    try:
        return {"archives": personal_repo.list_archived_sentences(user_id, date_from, date_to, limit)}
    except DashboardError as exc:
        raise HTTPException(exc.status, detail={"code":exc.code,"message":exc.message}) from exc


@router.get("/internal/personal/archives/popular")
def internal_popular_archives(x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    return {"archives": personal_repo.list_popular_archived_sentences()}


@router.get("/internal/personal/users/{user_id}")
def internal_get_user(user_id: str, x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    profile = personal_repo.get_user_profile(user_id)
    if not profile:
        raise HTTPException(status_code=404, detail="user not found")
    return {"user": profile}


@router.post("/internal/personal/users/{user_id}")
def internal_get_or_create_user(user_id: str, payload: Dict[str, Any] = Body(default={}), x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    return {"user": personal_repo.get_or_create_user(
        user_id, email=payload.get("email"), name=payload.get("name"), picture=payload.get("picture"),
    )}


@router.put("/internal/personal/users/{user_id}")
def internal_update_user(user_id: str, updates: Dict[str, Any] = Body(...), x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    profile = personal_repo.update_user_profile(user_id, updates)
    if not profile:
        raise HTTPException(status_code=404, detail="user not found")
    return {"user": profile}


@router.post("/internal/personal/readings")
def internal_save_reading(payload: Dict[str, Any] = Body(...), x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    try:
        return {"reading": personal_repo.save_reading_record(
            payload["user_id"], article_no=payload.get("article_no"),
            publication_id=payload.get("publication_id"),
        )}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))


@router.get("/internal/personal/readings")
def internal_list_readings(user_id: str = Query(...), limit: int = Query(default=50), x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    return {"readings": personal_repo.list_reading_history(user_id, limit)}
