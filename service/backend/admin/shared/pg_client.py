"""admin Lambda 용 얇은 pgvector 접근자.

v2 의 ``PgVectorV2Client`` 를 import 하지 않는 이유 (spec §5.0): 그러려면 admin 의 flat
import 패키징(Handler=handler.lambda_handler)을 통째로 바꿔야 하는데, 0단계 원칙인
"기존 라우트 동작 불변" 과 충돌한다. 여기서 필요한 건 연결과 run() 뿐이라 40줄이면 된다.

env: PG_V2_HOST / PG_V2_PORT / PG_V2_USER / PG_V2_DATABASE

비밀번호는 **환경변수가 아니라 SSM** 에서 온다 (`common.secrets.get_pg_password()`
→ SecureString `/sedaily-mbti/v2/pg-password`). 2026-07-30 이전에는
``PG_V2_PASSWORD`` 평문 환경변수를 읽었는데, v2 쪽은 이미 Admin-2c 에서 SSM 으로
옮겨 갔고(``PgVectorV2Client`` 는 그 환경변수를 아예 무시한다) admin 만 남아
운영 비밀번호 사본이 Lambda 설정에 그대로 노출돼 있었다. 같은 비밀을 가리키므로
드롭인 교체다.
"""
from __future__ import annotations

import logging
import os
from typing import Any

import pg8000.native

from common.secrets import get_pg_password

logger = logging.getLogger(__name__)

_conn: pg8000.native.Connection | None = None


def _enabled() -> bool:
    return bool(os.environ.get("PG_V2_HOST") and get_pg_password())


def get_conn() -> pg8000.native.Connection:
    """Lambda 컨테이너 재사용을 위해 커넥션을 캐시한다."""
    global _conn
    if _conn is None:
        if not _enabled():
            raise RuntimeError("PG_V2_HOST 미설정 또는 SSM 비밀번호 조회 실패")
        _conn = pg8000.native.Connection(
            host=os.environ["PG_V2_HOST"],
            port=int(os.environ.get("PG_V2_PORT", "5432")),
            user=os.environ["PG_V2_USER"],
            password=get_pg_password(),
            database=os.environ.get("PG_V2_DATABASE", "postgres"),
            timeout=10,
        )
    return _conn


def run(sql: str, **params: Any) -> list[list]:
    """``:name`` 플레이스홀더 + kwargs. 커넥션이 끊겼으면 1회 재연결 후 재시도."""
    global _conn
    try:
        return get_conn().run(sql, **params)
    except Exception as exc:
        logger.warning(f"pg run failed, reconnecting once: {type(exc).__name__}")
        close()
        return get_conn().run(sql, **params)


def close() -> None:
    global _conn
    if _conn is not None:
        try:
            _conn.close()
        except Exception:
            pass
        _conn = None
