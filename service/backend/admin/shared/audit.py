"""감사 로그 — 요청 컨텍스트 바인딩 + DDB 기록.

auth.py 에서 분리했다. 인증과 감사는 다른 관심사이고, 분리 전에는 routes/* 가
감사를 쓰려고 auth 를 import 해야 했다.

sk 는 'ISO8601(ms)#<4자 hex>' 형식이다. pk='AUDIT' 고정에 sk 가 ms 타임스탬프
뿐이면 같은 ms 의 두 건이 put_item 으로 덮어써져 조용히 사라진다. ISO 접두가
정렬을 지배하므로 접미가 붙어도 시간순이 보존되고, 접미 없는 기존 행과 섞여도
순서가 맞는다 — 마이그레이션이 필요 없다.

fail-open: 감사 실패가 글 발행을 막는 쪽이 더 나쁘다. raise 하지 않고 warning 만
남긴다.
"""

from __future__ import annotations

import datetime as dt
import logging
import secrets
from contextvars import ContextVar

from shared import ddb_client

logger = logging.getLogger(__name__)

_ctx: ContextVar[dict] = ContextVar("audit_ctx", default={})


def _now_iso_ms() -> str:
    return dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%fZ")


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
        item: dict = {
            "pk": "AUDIT",
            "sk": f"{_now_iso_ms()}#{secrets.token_hex(2)}",
            "action": action,
            "actor": "admin",
        }
        item.update(_ctx.get())
        if detail is not None:
            item["detail"] = detail
        ddb_client.config_table().put_item(Item=item)
    except Exception as e:
        logger.warning(f"audit.log failed for action={action}: {type(e).__name__}: {e}")
