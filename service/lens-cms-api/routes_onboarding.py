"""온보딩 선택 집계 라우트(공개). 결과 화면 분포 카드가 쓴다."""
from __future__ import annotations

from typing import Any, Dict, Optional

from fastapi import APIRouter, Body, Header
from fastapi.responses import JSONResponse

import onboarding_repo
from route_guards import _letter_call

router = APIRouter()


@router.get("/api/v2/onboarding/distribution")
def get_onboarding_distribution():
    """선택 분포(표본이 적으면 counts=null). 기기 식별자 없이 보는 경우(저장소 차단 등)에 쓴다."""
    return JSONResponse(_letter_call(onboarding_repo.distribution), headers={"Cache-Control": "public, max-age=60"})


@router.post("/api/v2/onboarding/choice")
def post_onboarding_choice(payload: Dict[str, Any] = Body(...), x_voter_id: Optional[str] = Header(default=None)):
    """이 기기의 선택을 저장하고 저장 후 분포를 돌려준다."""
    result = _letter_call(onboarding_repo.record, x_voter_id or "", str(payload.get("moment") or ""), str(payload.get("glance") or ""))
    return JSONResponse(result, headers={"Cache-Control": "no-store"})
