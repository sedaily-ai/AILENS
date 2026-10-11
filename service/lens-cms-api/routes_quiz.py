"""퀴즈 라우트.

main.py 분리(2026-10-12 리팩토링 5단계). 경로·응답은 분리 전과 같다.
"""
from __future__ import annotations

from fastapi import APIRouter
from typing import Any, Dict, Optional
from fastapi import Body, Header, HTTPException, Query
import quiz_repo
from route_guards import _check_admin_token

router = APIRouter()


@router.get("/api/quiz/today")
def quiz_today(limit: int = Query(default=4)):
    return {"quizzes": quiz_repo.list_published_quizzes(limit=limit)}


@router.post("/internal/quiz/attempt")
def internal_quiz_attempt(payload: Dict[str, Any] = Body(...), x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    ok = quiz_repo.record_attempt(payload["quiz_id"], bool(payload.get("correct")))
    if not ok:
        raise HTTPException(status_code=404, detail="quiz not found")
    return {"ok": True}


@router.post("/admin/quizzes")
def admin_create_quiz(payload: Dict[str, Any] = Body(...), x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    data = payload.get("data") or {}
    created_by = payload.get("created_by", "admin")
    return {"quiz": quiz_repo.create(data, created_by)}


@router.get("/admin/quizzes")
def admin_list_quiz(
    status: Optional[str] = Query(default=None),
    limit: int = Query(default=50),
    x_internal_token: Optional[str] = Header(default=None),
):
    _check_admin_token(x_internal_token)
    limit = max(1, min(limit, 200))
    quizzes = quiz_repo.list_quiz(status, limit)
    return {"quizzes": quizzes, "count": len(quizzes)}


@router.get("/admin/quizzes/{quiz_id}")
def admin_get_quiz(quiz_id: str, x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    quiz = quiz_repo.get(quiz_id)
    if not quiz:
        raise HTTPException(status_code=404, detail="quiz not found")
    return {"quiz": quiz}


@router.put("/admin/quizzes/{quiz_id}")
def admin_update_quiz(quiz_id: str, data: Dict[str, Any] = Body(...), x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    quiz = quiz_repo.update(quiz_id, data)
    if not quiz:
        raise HTTPException(status_code=404, detail="quiz not found")
    return {"quiz": quiz}


@router.post("/admin/quizzes/{quiz_id}/status")
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


@router.delete("/admin/quizzes/{quiz_id}")
def admin_delete_quiz(quiz_id: str, x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    if not quiz_repo.soft_delete(quiz_id):
        raise HTTPException(status_code=404, detail="quiz not found")
    return {"ok": True}
