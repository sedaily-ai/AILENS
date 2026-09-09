"""감사 로그 — 요청 컨텍스트 바인딩 + 기록.

auth.py 에서 분리했다. 인증과 감사는 다른 관심사이고, 분리 전에는 routes/* 가
감사를 쓰려고 auth 를 import 해야 했다.

2026-09-09(v1.27): 저장을 DynamoDB(admin-config 테이블 pk=AUDIT 공유)에서
PostgreSQL(lens-cms-api, `audit_logs` 테이블)로 전환. 이 파일 하나만 고치면
posts/quiz/letters/media/drivers/auth/admin_password/webtoon_lab/prompts
전부의 audit.log() 호출이 자동으로 새 저장소를 쓴다 — 호출부 20여 곳을
개별 수정할 필요가 없었다.

fail-open: 감사 실패가 글 발행을 막는 쪽이 더 나쁘다. raise 하지 않고 warning 만
남긴다.
"""

from __future__ import annotations

import logging
from contextvars import ContextVar

from repo import audit_repo

logger = logging.getLogger(__name__)

_ctx: ContextVar[dict] = ContextVar("audit_ctx", default={})


def bind_context(session: str | None = None, source_ip: str | None = None) -> None:
    """요청 스코프 컨텍스트를 설정한다. handler 가 dispatch 직전에 호출한다."""
    ctx: dict = {}
    if session:
        ctx["session"] = session
    if source_ip:
        ctx["source_ip"] = source_ip
    _ctx.set(ctx)


def reset_context() -> None:
    _ctx.set({})


def log(action: str, detail: dict | None = None) -> None:
    """audit row 1건 추가. 실패해도 raise 하지 않는다."""
    try:
        ctx = _ctx.get()
        audit_repo.log_event(
            action=action, detail=detail, actor="admin",
            session=ctx.get("session"), source_ip=ctx.get("source_ip"),
        )
    except Exception as e:
        logger.warning(f"audit.log failed for action={action}: {type(e).__name__}: {e}")
