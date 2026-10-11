"""관리자 글·선별 실행 라우트(/admin/posts*, /admin/selection*, /internal/selection-runs).

main.py 분리(2026-10-12 리팩토링 5단계). 경로·응답은 분리 전과 같다.
"""
from __future__ import annotations

from fastapi import APIRouter
from typing import Any, Dict, Optional
from fastapi import Body, Header, HTTPException, Query
import admin_posts_maintenance
import admin_posts_repo
import selection_repo
from route_guards import _check_admin_token

router = APIRouter()


@router.post("/admin/posts")
def admin_create_post(payload: Dict[str, Any] = Body(...), x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    data = payload.get("data") or {}
    created_by = payload.get("created_by", "admin")
    return {"post": admin_posts_repo.create(data, created_by)}


@router.get("/admin/posts/by-source-url")
def admin_find_post_by_source_url(source_url: str = Query(...), x_internal_token: Optional[str] = Header(default=None)):
    # 자동 파이프라인(frontpage_auto/mustknow_auto) 중복 발행 방지 — v1.32.
    # list_posts()는 admin_post_id IS NOT NULL 제한이 있어 v1.4 이관 글을
    # 못 찾는다. 여기는 그 제한 없이 source_url 정확히 일치만 본다.
    _check_admin_token(x_internal_token)
    return {"post": admin_posts_repo.find_by_source_url(source_url)}


@router.get("/admin/posts")
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


@router.get("/admin/posts/{post_id}")
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


@router.put("/admin/posts/{post_id}")
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


@router.post("/admin/posts/{post_id}/status")
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


@router.post("/admin/posts/soft-delete-by-slug")
def admin_soft_delete_by_slug(payload: Dict[str, Any] = Body(...), x_internal_token: Optional[str] = Header(default=None)):
    # admin_post_id가 없는 옛 글(테스트 글 등)은 아래 DELETE /admin/posts/{id}로 못 지운다(2026-10-09).
    # dry_run 기본값이 true라 body에 dry_run:false를 명시해야만 실제로 지운다. 조건이 하나라도 어긋나면 409로 아무것도 바꾸지 않는다.
    _check_admin_token(x_internal_token)
    slugs = payload.get("slugs")
    if not isinstance(slugs, list) or not all(isinstance(x, str) for x in slugs):
        raise HTTPException(status_code=400, detail="slugs는 문자열 배열이어야 합니다")
    dry_run = payload.get("dry_run", True) is not False
    try:
        return admin_posts_maintenance.soft_delete_empty_by_slugs(slugs, dry_run=dry_run)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))


@router.post("/admin/posts/reclassify-by-slug")
def admin_reclassify_by_slug(payload: Dict[str, Any] = Body(...), x_internal_token: Optional[str] = Header(default=None)):
    # 분류 개편(2026-10-09) 일괄 재분류. 관리자 PUT은 admin_post_id가 있는 글(공개 글의 약 62%)만 다뤄서, 8월 글 등 나머지를 같은 방식으로 바꾸려고 slug 기준으로 둔다.
    # dry_run 기본값이 true라 body에 dry_run:false를 명시해야 실제로 바꾼다. 조건이 어긋나면 409로 아무것도 바꾸지 않는다.
    _check_admin_token(x_internal_token)
    items = payload.get("items")
    if not isinstance(items, list) or not all(isinstance(x, dict) for x in items):
        raise HTTPException(status_code=400, detail="items는 객체 배열이어야 합니다")
    dry_run = payload.get("dry_run", True) is not False
    try:
        return admin_posts_maintenance.reclassify_by_slugs(items, dry_run=dry_run)
    except ValueError as e:
        raise HTTPException(status_code=409, detail=str(e))


@router.delete("/admin/posts/{post_id}")
def admin_delete_post(post_id: str, x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    if not admin_posts_maintenance.soft_delete(post_id):
        raise HTTPException(status_code=404, detail="post not found")
    return {"ok": True}


# ── 선정 실험실 — v1.35 ────────────────────────────────────────────
# mustknow_auto "일반" 카테고리 선정 결과를 날짜별로 모아 팀원이 적절/
# 애매/부적절로 채점하는 admin 화면. /internal/selection-runs는
# pipelines/mustknow_auto/run.py가 매 회차 직후 호출(하루 여러 번).
@router.post("/internal/selection-runs")
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


@router.get("/admin/selection-runs/dates")
def admin_selection_run_dates(
    category: str = Query(default="general"),
    limit: int = Query(default=30),
    x_internal_token: Optional[str] = Header(default=None),
):
    _check_admin_token(x_internal_token)
    return {"dates": selection_repo.list_dates(category, limit)}


@router.get("/admin/selection-runs")
def admin_selection_run_day(
    date: str = Query(...),
    category: str = Query(default="general"),
    x_internal_token: Optional[str] = Header(default=None),
):
    _check_admin_token(x_internal_token)
    return selection_repo.get_day(date, category)


@router.patch("/admin/selection-articles/{article_id}/score")
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
