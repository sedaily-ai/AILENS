"""Postgres 커넥션 풀 — 프로세스 수명 동안 계속 재사용한다.

Lambda 버전(clients/cms_posts_pg_client.py, pg8000)과 달리 이 서비스는
psycopg2를 쓴다 — Lambda 배포 패키지 크로스 컴파일 제약이 여기엔 없고
(EC2에 pip install로 직접 설치), 상시 프로세스라 진짜 커넥션 풀
(psycopg2.pool)을 쓸 수 있다. 이게 이 서비스를 만든 이유 그 자체다 —
Lambda는 호출마다 새 커넥션을 맺어야 했다.
"""
import os
import threading
from contextlib import contextmanager

import psycopg2
import psycopg2.pool
from psycopg2.extras import RealDictCursor

_PG_HOST = os.environ.get("LENS_PG_HOST", "lens-postgres-migration-dev.cluster-c83iuyksky7r.us-east-1.rds.amazonaws.com")
_PG_DATABASE = os.environ.get("LENS_PG_DATABASE", "lens")
_PG_USER = os.environ.get("LENS_PG_USER", "lens_service_app")
_PG_PASSWORD = os.environ.get("LENS_PG_PASSWORD", "")
_PG_MINCONN = int(os.environ.get("LENS_PG_POOL_MIN", "2"))
_PG_MAXCONN = int(os.environ.get("LENS_PG_POOL_MAX", "10"))
# 풀이 가득 찼을 때 대기할 최대 시간(초). 2026-10-01 이전엔 대기 없이 즉시
# PoolError("connection pool exhausted")를 던져, 동시 요청이 풀 크기(워커당 10)를
# 넘는 순간 500이 났다(실측 233회/일, 상세 조회·admin 포함).
_PG_ACQUIRE_TIMEOUT = float(os.environ.get("LENS_PG_ACQUIRE_TIMEOUT", "10"))

_pool = psycopg2.pool.ThreadedConnectionPool(
    _PG_MINCONN, _PG_MAXCONN,
    host=_PG_HOST, port=5432, dbname=_PG_DATABASE,
    user=_PG_USER, password=_PG_PASSWORD,
    connect_timeout=5,
)


# psycopg2의 ThreadedConnectionPool.getconn()은 풀이 비면 기다리지 않고 바로
# 예외를 던진다. 풀 크기와 같은 세마포어로 "대기"를 앞에 세워, 순간적으로 몰린
# 요청은 연결이 반납될 때까지 줄을 서고(보통 수십~수백 ms), _PG_ACQUIRE_TIMEOUT을
# 넘겨서야 실패한다(백프레셔).
_slots = threading.BoundedSemaphore(_PG_MAXCONN)


@contextmanager
def get_cursor():
    if not _slots.acquire(timeout=_PG_ACQUIRE_TIMEOUT):
        raise psycopg2.pool.PoolError(f"connection pool exhausted (waited {_PG_ACQUIRE_TIMEOUT:g}s)")
    try:
        conn = _pool.getconn()
        try:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                yield cur
            conn.commit()
        except Exception:
            conn.rollback()
            raise
        finally:
            _pool.putconn(conn)
    finally:
        _slots.release()


def pool_status() -> dict:
    return {"minconn": _pool.minconn, "maxconn": _pool.maxconn}
