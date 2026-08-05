"""
pgvector Client
PostgreSQL + pgvector for cosine similarity search.

Complements OpenSearch (which handles RAG/hybrid search) by providing:
  - Article vector storage with SQL query capabilities
  - Archived sentence similarity search ("내 서랍" related sentences)
  - Relational joins between vectors and other data

Driver: pg8000 (pure Python, no C dependencies — Lambda-friendly)

Tables:
  articles_vectors  — article chunk embeddings (news_id + mbti_group)
  archive_vectors   — user-archived sentence embeddings (user_id + article_id)

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
from datetime import datetime, timezone, timedelta
from typing import Optional, Dict, Any, List, Tuple

import pg8000.native

from config.constants import BEDROCK_EMBEDDING_DIMENSION

logger = logging.getLogger(__name__)

KST = timezone(timedelta(hours=9))


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
    # Schema
    # =========================================================================

    def init_tables(self):
        """
        Create tables and pgvector extension if they don't exist.

        Tables:
          articles_vectors — article chunk embeddings
          archive_vectors  — user-archived sentence embeddings

        Safe to call repeatedly (IF NOT EXISTS).
        """
        if not self._enabled:
            return
        c = self.conn

        c.run("CREATE EXTENSION IF NOT EXISTS vector")

        c.run(f"""
            CREATE TABLE IF NOT EXISTS articles_vectors (
                id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                news_id     TEXT NOT NULL,
                mbti_group  TEXT NOT NULL DEFAULT '',
                chunk_text  TEXT NOT NULL,
                embedding   vector({self._dimension}) NOT NULL,
                created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
            )
        """)

        c.run("""
            CREATE INDEX IF NOT EXISTS idx_articles_vectors_news_id
            ON articles_vectors (news_id)
        """)

        c.run("""
            CREATE INDEX IF NOT EXISTS idx_articles_vectors_embedding
            ON articles_vectors
            USING ivfflat (embedding vector_cosine_ops)
            WITH (lists = 100)
        """)

        c.run(f"""
            CREATE TABLE IF NOT EXISTS archive_vectors (
                id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                user_id      TEXT NOT NULL,
                sentence_text TEXT NOT NULL,
                article_id   TEXT NOT NULL DEFAULT '',
                embedding    vector({self._dimension}) NOT NULL,
                created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
            )
        """)

        c.run("""
            CREATE INDEX IF NOT EXISTS idx_archive_vectors_user_id
            ON archive_vectors (user_id)
        """)

        c.run("""
            CREATE INDEX IF NOT EXISTS idx_archive_vectors_embedding
            ON archive_vectors
            USING ivfflat (embedding vector_cosine_ops)
            WITH (lists = 100)
        """)

        logger.info("pgvector tables initialized")

    # =========================================================================
    # Article Vectors
    # =========================================================================

    def insert_article_vector(
        self,
        news_id: str,
        mbti_group: str,
        chunk_text: str,
        embedding: List[float],
    ) -> str:
        """
        Insert an article chunk embedding.

        Args:
            news_id: Article ID
            mbti_group: MBTI group (NT/NF/ST/SF) or '' for original
            chunk_text: The text that was embedded
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
                "INSERT INTO articles_vectors (id, news_id, mbti_group, chunk_text, embedding) "
                "VALUES (:id, :news_id, :mbti_group, :chunk_text, :embedding::vector)",
                id=row_id,
                news_id=news_id,
                mbti_group=mbti_group,
                chunk_text=chunk_text,
                embedding=vec_str,
            )

            logger.debug(f"Inserted article vector: {news_id}/{mbti_group}")
            return row_id
        except Exception as e:
            logger.warning(f"pgvector insert_article_vector failed: {e}")
            return ''

    def delete_article_vectors(self, news_id: str, mbti_group: Optional[str] = None) -> int:
        """
        Delete vectors for an article.

        Args:
            news_id: Article ID
            mbti_group: If set, only delete vectors for this group

        Returns:
            Number of deleted rows
        """
        if not self._enabled:
            return 0
        try:
            if mbti_group:
                self.conn.run(
                    "DELETE FROM articles_vectors WHERE news_id = :nid AND mbti_group = :g",
                    nid=news_id, g=mbti_group,
                )
            else:
                self.conn.run(
                    "DELETE FROM articles_vectors WHERE news_id = :nid",
                    nid=news_id,
                )
            return 1
        except Exception as e:
            logger.warning(f"pgvector delete_article_vectors failed: {e}")
            return 0

    def search_similar_articles(
        self,
        embedding: List[float],
        limit: int = 10,
        category_filter: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """
        Find articles similar to the query embedding using cosine distance.

        Args:
            embedding: Query vector (1024-dim)
            limit: Max results
            category_filter: Not stored in this table — ignored here.
                Use OpenSearch hybrid_search for category-filtered vector search.

        Returns:
            List of dicts with news_id, mbti_group, chunk_text, distance, created_at
        """
        if not self._enabled:
            return []
        try:
            vec_str = _vec_literal(embedding)

            rows = self.conn.run(
                "SELECT news_id, mbti_group, chunk_text, "
                "       embedding <=> :q::vector AS distance, "
                "       created_at "
                "FROM articles_vectors "
                "ORDER BY embedding <=> :q::vector "
                "LIMIT :lim",
                q=vec_str,
                lim=limit,
            )

            return [
                {
                    'news_id': r[0],
                    'mbti_group': r[1],
                    'chunk_text': r[2],
                    'distance': float(r[3]),
                    'created_at': str(r[4]),
                }
                for r in rows
            ]
        except Exception as e:
            logger.warning(f"pgvector search_similar_articles failed: {e}")
            return []

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

    def delete_archive_vector(self, row_id: str) -> bool:
        """Delete a single archive vector by its UUID."""
        if not self._enabled:
            return False
        try:
            self.conn.run(
                "DELETE FROM archive_vectors WHERE id = :id",
                id=row_id,
            )
            return True
        except Exception as e:
            logger.warning(f"pgvector delete_archive_vector failed: {e}")
            return False

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


    # ── Aliases (match spec naming) ────────────────────────────────────────

    def store_embedding(
        self, news_id: str, embedding: List[float], metadata: Optional[Dict[str, Any]] = None,
    ) -> str:
        """Alias for insert_article_vector."""
        meta = metadata or {}
        return self.insert_article_vector(
            news_id=news_id,
            mbti_group=meta.get('mbti_group', ''),
            chunk_text=meta.get('chunk_text', ''),
            embedding=embedding,
        )

    def search_similar(
        self, embedding: List[float], k: int = 10,
    ) -> List[Dict[str, Any]]:
        """Alias for search_similar_articles."""
        return self.search_similar_articles(embedding, limit=k)

    def store_sentence_embedding(
        self, sentence_id: str, user_id: str, embedding: List[float],
        metadata: Optional[Dict[str, Any]] = None,
    ) -> str:
        """Alias for insert_archive_vector."""
        meta = metadata or {}
        return self.insert_archive_vector(
            user_id=user_id,
            sentence_text=meta.get('sentence_text', ''),
            article_id=meta.get('article_id', ''),
            embedding=embedding,
        )


# ── Utility ──────────────────────────────────────────────────────────────────

def _vec_literal(embedding: List[float]) -> str:
    """
    Convert a Python list of floats to a pgvector literal string.

    pg8000 doesn't have native vector type support, so we pass the
    vector as a text literal and cast with ::vector in SQL.

    Example: [0.1, 0.2, 0.3] → '[0.1,0.2,0.3]'
    """
    return '[' + ','.join(str(v) for v in embedding) + ']'
