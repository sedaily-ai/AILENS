"""감사 로그·설정(기능 플래그·임계값)·로그인 잠금 라우트.

main.py 분리(2026-10-12 리팩토링 5단계). 경로·응답은 분리 전과 같다.
"""
from __future__ import annotations

from fastapi import APIRouter
from typing import Any, Dict, Optional
from fastapi import Body, Header, Query
import audit_repo
import config_repo
from route_guards import _check_admin_token

router = APIRouter()


# --- 감사 로그 (v1.27) ---

@router.post("/internal/audit/log")
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


@router.get("/internal/audit")
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


# --- feature flag / threshold / admin 로그인 잠금 (v1.28) ---
# 전부 내부 토큰 보호 — DynamoDB 시절도 공개 노출이 아니라 Lambda IAM
# 권한으로 막혀 있던 운영 설정값(feature flag/threshold)과 admin 로그인
# 보안 상태(lockout)라, 공개 엔드포인트로 바꾸지 않았다.

@router.get("/internal/config/feature-flags")
def internal_list_feature_flags(x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    return {"flags": config_repo.list_feature_flags()}


@router.get("/internal/config/feature-flags/{name}")
def internal_get_feature_flag(name: str, x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    return {"name": name, "enabled": config_repo.get_feature_flag(name)}


@router.put("/internal/config/feature-flags/{name}")
def internal_set_feature_flag(name: str, payload: Dict[str, Any] = Body(...), x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    updated_at = config_repo.set_feature_flag(name, bool(payload["enabled"]))
    return {"name": name, "enabled": bool(payload["enabled"]), "updated_at": updated_at}


@router.get("/internal/config/thresholds")
def internal_list_thresholds(x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    return {"thresholds": config_repo.list_thresholds()}


@router.get("/internal/config/thresholds/{name}")
def internal_get_threshold(name: str, x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    return {"name": name, "value": config_repo.get_threshold(name)}


@router.put("/internal/config/thresholds/{name}")
def internal_set_threshold(name: str, payload: Dict[str, Any] = Body(...), x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    value = int(payload["value"])
    updated_at = config_repo.set_threshold(name, value)
    return {"name": name, "value": value, "updated_at": updated_at}


@router.post("/internal/auth/lockout/check")
def internal_lockout_check(x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    return {"retry_after_seconds": config_repo.check_lockout()}


@router.post("/internal/auth/lockout/fail")
def internal_lockout_fail(payload: Dict[str, Any] = Body(...), x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    fail_count, lockout_until = config_repo.record_login_fail(
        threshold=payload.get("threshold", 5),
        lockout_minutes=payload.get("lockout_minutes", 5),
    )
    return {"fail_count": fail_count, "lockout_until": lockout_until}


@router.post("/internal/auth/lockout/reset")
def internal_lockout_reset(x_internal_token: Optional[str] = Header(default=None)):
    _check_admin_token(x_internal_token)
    config_repo.reset_login_fail()
    return {"ok": True}
