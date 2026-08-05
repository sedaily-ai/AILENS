"""PgVector v2 Client — Front Page (지면 1면) 전용.

2026-08-05: 이 클라이언트는 원래 v2 pgvector Storage Hub 전체(기사 수집,
MBTI 버전, 유저 프로필/인터랙션, Selector/Transform 큐, Editor Pick, 오늘의
한 통)를 떠안은 34-메서드 God Object였다. RDS(``sedaily-mbti-pgvector-v2-dev``)가
2026-08-04 삭제되며 그 위에 있던 자동 수집→AI 생성 파이프라인(Collector,
Editor Pick, Core 3 개인화) 자체가 폐기 결정났고, 관련 소스가 전부 삭제되며
이 클라이언트가 실제로 쓰이는 곳도 ``handlers/front_page.py`` 하나만 남았다.
그래서 front-page 전용으로 축소했다 — 남은 두 메서드 외 전부 제거.

⚠️ front-page 자체도 지금 이 RDS 삭제 때문에 500 에러 상태다(``self._enabled``가
``False``로 no-op 모드에 빠지거나, 접속을 시도하면 실패한다). 이 파일은 그 상태를
고치는 게 아니라 죽은 코드를 걷어낸 것뿐 — front-page 복구 여부는 별도 결정 사항.

Connection
----------
* Host/port/database/user via env vars: ``PG_V2_HOST``, ``PG_V2_PORT``
  (5432), ``PG_V2_DATABASE`` (``ailens_v2``), ``PG_V2_USER`` (``ailens``).
* Password via SSM SecureString, fetched by ``common.secrets.get_pg_password``
  (fail-closed — missing parameter or denied decrypt raises).
* Callers may override by passing ``password=""`` to force legacy **no-op
  mode** — every method returns a safe default and logs a warning.
* ``pg8000.native.Connection`` is created lazily on first use and reused
  within the same Lambda container; ``close()`` tears it down.
"""
from __future__ import annotations

import json
import logging
import os
from typing import Any, Dict, List, Optional

from common.secrets import get_pg_password

logger = logging.getLogger(__name__)


class PgVectorV2Client:
    """Front-page(지면 1면) 읽기 전용 pgvector 클라이언트."""

    def __init__(
        self,
        host: Optional[str] = None,
        port: Optional[int] = None,
        database: Optional[str] = None,
        user: Optional[str] = None,
        password: Optional[str] = None,
    ) -> None:
        self._host = host or os.getenv("PG_V2_HOST", "")
        self._port = port or int(os.getenv("PG_V2_PORT", "5432"))
        self._database = database or os.getenv("PG_V2_DATABASE", "ailens_v2")
        self._user = user or os.getenv("PG_V2_USER", "ailens")
        self._password = password if password is not None else get_pg_password()
        self._conn = None
        self._enabled = bool(self._password)
        if not self._enabled:
            logger.warning(
                "PgVectorV2Client constructed with empty password — running in no-op mode"
            )

    # ---- connection ---------------------------------------------------------

    @property
    def conn(self):
        """Lazy ``pg8000.native.Connection``. Cached for container reuse."""
        if self._conn is None:
            # Lazy import: unit tests and ``--dry-run`` paths don't need pg8000.
            import pg8000.native  # noqa: WPS433

            self._conn = pg8000.native.Connection(
                host=self._host,
                port=self._port,
                database=self._database,
                user=self._user,
                password=self._password,
                ssl_context=True,
            )
            logger.info(
                f"Connected to {self._host}:{self._port}/{self._database}"
            )
        return self._conn

    def close(self) -> None:
        """Close the cached connection if one exists. Safe to call twice."""
        if self._conn is not None:
            self._conn.close()
            self._conn = None

    # ------------------------------------------------------------------
    # Front Page (지면 1면) read path — front-page-live-data spec §5.2
    # ------------------------------------------------------------------

    def get_front_page_articles(self, paper_date: str) -> List[Dict[str, Any]]:
        """지면 1면(paperNumber=='1') 기사 rows. ``paper_date``는 'YYYYMMDD'.

        정렬은 핸들러가 수행(is_top 우선) — 여기선 조회만.
        """
        if not self._enabled:
            return []
        rows = self.conn.run(
            """
            SELECT news_id, title, category, published_at, metadata
            FROM articles
            WHERE metadata->>'paper_number' = '1'
              AND metadata->>'paper_date' = :pdate
            """,
            pdate=paper_date,
        )
        out: List[Dict[str, Any]] = []
        for r in rows:
            md = r[4]
            if isinstance(md, str):
                try:
                    md = json.loads(md)
                except Exception:
                    md = {}
            out.append({
                "news_id": r[0],
                "title": r[1],
                "category": r[2],
                "published_at": r[3].isoformat() if hasattr(r[3], "isoformat") else r[3],
                "metadata": md or {},
            })
        return out

    def get_latest_front_page_date(self, upper_bound: str) -> Optional[str]:
        """저장된 가장 최근 지면일('YYYYMMDD', ``<= upper_bound``). 없으면 None.

        주말·휴간일 fallback 용 — 요청일에 지면이 없으면 직전 발행일을 찾는다.
        """
        if not self._enabled:
            return None
        rows = self.conn.run(
            """
            SELECT MAX(metadata->>'paper_date')
            FROM articles
            WHERE metadata->>'paper_number' = '1'
              AND COALESCE(metadata->>'paper_date', '') <> ''
              AND metadata->>'paper_date' <= :ub
            """,
            ub=upper_bound,
        )
        if rows and rows[0] and rows[0][0]:
            return rows[0][0]
        return None
