"""Postgres 커넥션 풀 — 프로세스 수명 동안 계속 재사용한다.

Lambda 버전(clients/cms_posts_pg_client.py, pg8000)과 달리 이 서비스는
psycopg2를 쓴다 — Lambda 배포 패키지 크로스 컴파일 제약이 여기엔 없고
(EC2에 pip install로 직접 설치), 상시 프로세스라 진짜 커넥션 풀
(psycopg2.pool)을 쓸 수 있다. 이게 이 서비스를 만든 이유 그 자체다 —
Lambda는 호출마다 새 커넥션을 맺어야 했다.
"""
import os
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

_pool = psycopg2.pool.ThreadedConnectionPool(
    _PG_MINCONN, _PG_MAXCONN,
    host=_PG_HOST, port=5432, dbname=_PG_DATABASE,
    user=_PG_USER, password=_PG_PASSWORD,
    connect_timeout=5,
)


@contextmanager
def get_cursor():
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


def pool_status() -> dict:
    return {"minconn": _pool.minconn, "maxconn": _pool.maxconn}
