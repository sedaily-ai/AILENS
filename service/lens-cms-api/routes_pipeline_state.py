"""파이프라인 상태 라우트(후보 기사 중복 기록, 관리자 작업, 일일 질문).

main.py 분리(2026-10-12 리팩토링 5단계). 경로·응답은 분리 전과 같다.
"""
from __future__ import annotations

from fastapi import APIRouter
from typing import Any, Dict, Optional
from fastapi import Body, Header, HTTPException, Query
import admin_jobs_repo
import candidate_seen_repo
import daily_questions_repo
from route_guards import _check_admin_token, _bad_request

router = APIRouter()


@router.post("/internal/candidate-seen/exists")
def internal_candidate_seen_exists(payload: Dict[str, Any] = Body(...), x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    try:
        return {"seen": candidate_seen_repo.exists_keys(payload.get("pipeline", ""), payload.get("keys") or [])}
    except ValueError as e:
        raise _bad_request(e)


@router.post("/internal/candidate-seen")
def internal_candidate_seen_mark(payload: Dict[str, Any] = Body(...), x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    try:
        return candidate_seen_repo.mark_seen(
            pipeline=payload.get("pipeline", ""),
            article_key=payload.get("article_key", ""),
            tab=payload.get("tab"),
            score=payload.get("score"),
            reasoning=payload.get("reasoning"),
            is_manual=bool(payload.get("is_manual", False)),
            excluded_from_general=bool(payload.get("excluded_from_general", False)),
            reason=payload.get("reason"),
            detail=payload.get("detail"),
        )
    except ValueError as e:
        raise _bad_request(e)


@router.post("/internal/candidate-seen/bulk")
def internal_candidate_seen_bulk(payload: Dict[str, Any] = Body(...), x_internal_token: Optional[str] = Header(default=None)):
    """옛 DynamoDB 항목 일괄 이관용(dry_run 기본). 이미 있는 키는 건너뛴다."""
    _check_admin_token(x_internal_token)
    try:
        return candidate_seen_repo.bulk_import(payload.get("items") or [], dry_run=bool(payload.get("dry_run", True)))
    except ValueError as e:
        raise _bad_request(e)


@router.get("/internal/candidate-seen/count")
def internal_candidate_seen_count(pipeline: Optional[str] = Query(default=None), x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    return {"count": candidate_seen_repo.count(pipeline)}


@router.post("/internal/admin-jobs")
def internal_admin_job_create(payload: Dict[str, Any] = Body(...), x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    try:
        return {"job": admin_jobs_repo.create_job(payload.get("kind", ""), payload.get("job_id", ""), payload.get("payload"), payload.get("ttl_days", 30))}
    except ValueError as e:
        raise _bad_request(e)
    except LookupError as e:
        raise HTTPException(status_code=409, detail=str(e))


@router.patch("/internal/admin-jobs/{kind}/{job_id}")
def internal_admin_job_update(kind: str, job_id: str, payload: Dict[str, Any] = Body(...), x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    try:
        job = admin_jobs_repo.update_job(kind, job_id, payload.get("status"), payload.get("error"), payload.get("result"))
    except ValueError as e:
        raise _bad_request(e)
    if not job:
        raise HTTPException(status_code=404, detail="job not found")
    return {"job": job}


@router.get("/internal/admin-jobs/{kind}/{job_id}")
def internal_admin_job_get(kind: str, job_id: str, x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    try:
        job = admin_jobs_repo.get_job(kind, job_id)
    except ValueError as e:
        raise _bad_request(e)
    if not job:
        raise HTTPException(status_code=404, detail="job not found")
    return {"job": job}


@router.get("/internal/daily-questions/{date}")
def internal_daily_questions_get(date: str, x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    try:
        row = daily_questions_repo.get_questions(date)
    except ValueError as e:
        raise _bad_request(e)
    if not row:
        raise HTTPException(status_code=404, detail="questions not found")
    return {"daily_questions": row}


@router.put("/internal/daily-questions/{date}")
def internal_daily_questions_put(date: str, payload: Dict[str, Any] = Body(...), x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    try:
        return {"daily_questions": daily_questions_repo.save_questions(date, payload.get("questions"), payload.get("model"), payload.get("generated_at"))}
    except ValueError as e:
        raise _bad_request(e)
