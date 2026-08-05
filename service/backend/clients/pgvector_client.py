"""
pgvector Client — "내 서랍"(Archive) 유사 문장 검색 전용.

2026-08-05: 원래 기사 벡터 검색(articles_vectors 테이블: insert_article_vector,
search_similar_articles, delete_article_vectors, init_tables)까지 담당하는
클라이언트였지만, 그 기능을 쓰는 handler가 없어 죽은 코드였다 — 실제로는
`handlers/archive_handler.py`의 "내 서랍" 유사 문장 검색(archive_vectors 테이블)
만 살아있어서 그쪽으로 축소했다. `delete_archive_vector`도 같이 지웠다 —
`archive_handler.py`의 삭제 경로는 이 메서드를 호출하지 않고 "cleanup needed"
로그만 남기는 best-effort 미완성 상태였다(호출자 없음, 삭제해도 동작 변화 없음).

⚠️ `clients/pgvector_v2_client.py`(front-page 전용으로 이미 축소됨)와는 완전히
다른 시스템이다 — 이 클라이언트는 `PG_HOST`/`PG_PASSWORD`(db `ailens`) 를 쓰고,
v2는 `PG_V2_HOST`/`PG_V2_PASSWORD`(db `ailens_v2`, SSM 기반)를 쓴다. 이름이
비슷해서 혼동하기 쉽다.

Driver: pg8000 (pure Python, no C dependencies — Lambda-friendly)

Table: archive_vectors — user-archived sentence embeddings (user_id + article_id)

Env vars:
  PG_HOST     — RDS endpoint
  PG_PORT     — default 5432
  PG_DATABASE — default sedaily_mbti
  PG_USER     — default postgres
  PG_PASSWORD — required
"""
import logging
import os
import uuid
from typing import Optional, Dict, Any, List

import pg8000.native

from config.constants import BEDROCK_EMBEDDING_DIMENSION

logger = logging.getLogger(__name__)


class PgVectorClient:
    """
    Client for PostgreSQL + pgvector similarity search.

    Uses pg8000.native (DB-API connection) for Lambda compatibility.
    Connection is created lazily on first use and reused within the
    same Lambda container.
    """

    def __init__(
        self,
        host: Optional[str] = None,
        port: Optional[int] = None,
        database: Optional[str] = None,
        user: Optional[str] = None,
        password: Optional[str] = None,
        dimension: int = BEDROCK_EMBEDDING_DIMENSION,
    ):
        self._host = host or os.getenv('PG_HOST', '')
        self._port = port or int(os.getenv('PG_PORT', '5432'))
        self._database = database or os.getenv('PG_DATABASE', 'ailens')
        self._user = user or os.getenv('PG_USER', 'ailens')
        self._password = password or os.getenv('PG_PASSWORD', '')
        self._dimension = dimension
        self._conn = None
        self._enabled = bool(self._password)

        if not self._enabled:
            logger.warning("PG_PASSWORD is empty — pgvector running in no-op mode")

    @property
    def conn(self):
        """Lazy-load database connection."""
        if self._conn is None:
            self._conn = pg8000.native.Connection(
                host=self._host,
                port=self._port,
                database=self._database,
                user=self._user,
                password=self._password,
                ssl_context=True,
            )
            logger.info(f"Connected to PostgreSQL at {self._host}:{self._port}/{self._database}")
        return self._conn

    def close(self):
        """Close the database connection."""
        if self._conn is not None:
            self._conn.close()
            self._conn = None

    # =========================================================================
    # Archive Vectors (내 서랍)
    # =========================================================================

    def insert_archive_vector(
        self,
        user_id: str,
        sentence_text: str,
        article_id: str,
        embedding: List[float],
    ) -> str:
        """
        Insert an archived sentence embedding.

        Args:
            user_id: User who archived the sentence
            sentence_text: The archived sentence
            article_id: Source article ID
            embedding: Vector from EmbeddingClient

        Returns:
            Generated UUID of the inserted row
        """
        if not self._enabled:
            return ''
        try:
            row_id = str(uuid.uuid4())
            vec_str = _vec_literal(embedding)

            self.conn.run(
                "INSERT INTO archive_vectors (id, user_id, sentence_text, article_id, embedding) "
                "VALUES (:id, :uid, :txt, :aid, :emb::vector)",
                id=row_id,
                uid=user_id,
                txt=sentence_text,
                aid=article_id,
                emb=vec_str,
            )

            logger.debug(f"Inserted archive vector: user={user_id} article={article_id}")
            return row_id
        except Exception as e:
            logger.warning(f"pgvector insert_archive_vector failed: {e}")
            return ''

    def search_similar_sentences(
        self,
        embedding: List[float],
        user_id: Optional[str] = None,
        limit: int = 10,
    ) -> List[Dict[str, Any]]:
        """
        Find archived sentences similar to the query embedding.

        Args:
            embedding: Query vector (1024-dim)
            user_id: If set, restrict to this user's archive only
            limit: Max results

        Returns:
            List of dicts with user_id, sentence_text, article_id, distance, created_at
        """
        if not self._enabled:
            return []
        try:
            vec_str = _vec_literal(embedding)

            if user_id:
                rows = self.conn.run(
                    "SELECT user_id, sentence_text, article_id, "
                    "       embedding <=> :q::vector AS distance, "
                    "       created_at "
                    "FROM archive_vectors "
                    "WHERE user_id = :uid "
                    "ORDER BY embedding <=> :q::vector "
                    "LIMIT :lim",
                    q=vec_str,
                    uid=user_id,
                    lim=limit,
                )
            else:
                rows = self.conn.run(
                    "SELECT user_id, sentence_text, article_id, "
                    "       embedding <=> :q::vector AS distance, "
                    "       created_at "
                    "FROM archive_vectors "
                    "ORDER BY embedding <=> :q::vector "
                    "LIMIT :lim",
                    q=vec_str,
                    lim=limit,
                )

            return [
                {
                    'user_id': r[0],
                    'sentence_text': r[1],
                    'article_id': r[2],
                    'distance': float(r[3]),
                    'created_at': str(r[4]),
                }
                for r in rows
            ]
        except Exception as e:
            logger.warning(f"pgvector search_similar_sentences failed: {e}")
            return []


# ── Utility ──────────────────────────────────────────────────────────────────

def _vec_literal(embedding: List[float]) -> str:
    """
    Convert a Python list of floats to a pgvector literal string.

    pg8000 doesn't have native vector type support, so we pass the
    vector as a text literal and cast with ::vector in SQL.

    Example: [0.1, 0.2, 0.3] → '[0.1,0.2,0.3]'
    """
    return '[' + ','.join(str(v) for v in embedding) + ']'
