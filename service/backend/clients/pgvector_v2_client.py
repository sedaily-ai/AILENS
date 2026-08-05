"""PgVector v2 Client — AI LENS v2 Storage Hub.

Thin wrapper over ``pg8000.native`` for the four v2 tables
(``articles``, ``article_versions``, ``user_profiles``,
``user_interactions``). v1 remains on ``clients.pgvector_client``; this
module is a separate class operating against the v2 database so the two
never share state.

Connection
----------
* Host/port/database/user via env vars: ``PG_V2_HOST``, ``PG_V2_PORT``
  (5432), ``PG_V2_DATABASE`` (``ailens_v2``), ``PG_V2_USER`` (``ailens``).
* Password via SSM SecureString (Admin-2c migration). Default path
  ``/sedaily-mbti/v2/pg-password`` — overridable via the
  ``PG_PASSWORD_SSM_PARAM`` env var. Fetched on first use and cached for
  5 minutes inside ``common.secrets.get_pg_password``; the Lambda role
  needs ``ssm:GetParameter`` and ``kms:Decrypt`` (via
  ``kms:ViaService = ssm.<region>.amazonaws.com``). The SSM path is
  fail-closed — a missing parameter or denied decrypt raises rather
  than silently entering no-op mode.
* Callers may still override by passing ``password=...`` directly to the
  constructor (tests / one-shot scripts that hold the password elsewhere).
  Passing an explicit empty string keeps the legacy **no-op mode** —
  every method returns a safe default (``None`` / ``[]`` / ``{}`` / ``''``)
  and logs a warning, mirroring v1 ``PgVectorClient`` for local dev.
* The ``pg8000.native.Connection`` is created lazily on first use and
  reused within the same Lambda container; ``close()`` tears it down.

Error policy
------------
Query exceptions are caught and logged — methods fall back to the same
no-op default. The lone exception is ``update_article_status`` which
logs at ``ERROR`` level with ``exc_info`` because a failed status
transition can strand articles outside the pipeline. Upstream handlers
decide how to react; this client never raises from a DB error.

Schema reference: ``backend/v2/infrastructure/schema_v2.sql``.
"""
from __future__ import annotations

import json
import logging
import os
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
from typing import Any, Dict, List, Optional

from common.secrets import get_pg_password

logger = logging.getLogger(__name__)


# ── Constants ────────────────────────────────────────────────────────────────

# Titan V2 output dimension. schema_v2.sql pins every vector column to 1024.
_DEFAULT_DIMENSION = 1024

# article_versions.mbti_type / user_interactions.mbti_type CHECK values.
_MBTI_GROUPS = ("NT", "NF", "ST", "SF")

# articles.status CHECK values.
_ARTICLE_STATUSES = ("raw", "transformed", "failed")

# user_interactions.interaction_type CHECK values.
_INTERACTION_TYPES = ("click", "dwell", "scroll", "skip", "react", "rate")

# user_interactions columns that may arrive via record_interaction(**kwargs).
# Anything else in kwargs goes into the ``metadata`` JSONB column.
_INTERACTION_COLUMNS = ("dwell_ms", "scroll_pct", "rating", "reaction_type")


# ── Module-level helpers ─────────────────────────────────────────────────────


def _normalize_mbti_group(mbti: str) -> str:
    """Convert full MBTI (INTJ) or group (NT) to group form (NT/NF/ST/SF).

    Shared with Context Broker and Recommend Agent (Phase 3) so callers
    can pass either a user's stored ``mbti_type`` (4-char) or a 2-char
    group without branching.
    """
    if not isinstance(mbti, str):
        raise ValueError(f"Invalid mbti: {mbti!r}")
    if len(mbti) == 4:
        group = mbti[1:3]
    elif len(mbti) == 2:
        group = mbti
    else:
        raise ValueError(f"Invalid mbti: {mbti!r}")
    if group not in _MBTI_GROUPS:
        raise ValueError(f"Invalid mbti group: {group!r}")
    return group


def _vec_literal(embedding: List[float]) -> str:
    """Render a Python list of floats as a pgvector text literal.

    Example: ``[0.1, 0.2, 0.3]`` → ``'[0.1,0.2,0.3]'``. Paired with a
    ``::vector`` cast in SQL because pg8000 has no native vector support.

    Pure conversion — does not validate dimension. ``NaN``/``Inf`` are
    stringified verbatim and rejected downstream by pgvector. Dimension
    validation is a per-instance concern; see ``_validate_embedding``.
    """
    return "[" + ",".join(str(v) for v in embedding) + "]"


def _json_default(obj: Any) -> Any:
    """Fallback serializer used by every ``json.dumps`` call in this client.

    JSONB columns store caller-supplied metadata (collector headers,
    interaction annotations). Callers occasionally hand us ``datetime``,
    ``Decimal``, or ``set`` values; those three are the tolerated types
    here. Anything else raises ``TypeError`` — an explicit failure is
    better than silently losing data in a JSONB blob.

    * ``datetime`` / ``date`` → ISO-8601 string (timezone preserved)
    * ``Decimal``             → ``int`` when whole, otherwise ``float``
    * ``set`` / ``frozenset`` → ``list``

    Deliberately narrower than v1's ``core.response._json_serializer``
    (no ``hasattr(obj, '__dict__')`` fallback) because JSONB stores
    structured query-able data; smuggling object state via ``__dict__``
    would escape that contract.
    """
    if isinstance(obj, (datetime, date)):
        return obj.isoformat()
    if isinstance(obj, Decimal):
        return int(obj) if obj % 1 == 0 else float(obj)
    if isinstance(obj, (set, frozenset)):
        return list(obj)
    raise TypeError(
        f"Object of type {type(obj).__name__} is not JSON serializable"
    )


# ── Client ───────────────────────────────────────────────────────────────────


class PgVectorV2Client:
    """Client for the AI LENS v2 pgvector Storage Hub.

    See module docstring for connection and error semantics.
    """

    def __init__(
        self,
        host: Optional[str] = None,
        port: Optional[int] = None,
        database: Optional[str] = None,
        user: Optional[str] = None,
        password: Optional[str] = None,
        dimension: int = _DEFAULT_DIMENSION,
    ) -> None:
        self._host = host or os.getenv("PG_V2_HOST", "")
        self._port = port or int(os.getenv("PG_V2_PORT", "5432"))
        self._database = database or os.getenv("PG_V2_DATABASE", "ailens_v2")
        self._user = user or os.getenv("PG_V2_USER", "ailens")
        self._password = password if password is not None else get_pg_password()
        self._dimension = dimension
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

    # ---- validation ---------------------------------------------------------

    def _validate_embedding(self, embedding: List[float]) -> None:
        """Fail fast on wrong-length vectors.

        ``NaN``/``Inf`` values are left to pgvector to reject — the server
        returns a clear error, and client-side filtering here would swallow
        useful diagnostics. Length, however, is both cheap to check and
        otherwise silent in no-op mode, so we validate it unconditionally.
        Called from every method that writes or queries on an embedding.
        """
        if len(embedding) != self._dimension:
            raise ValueError(
                f"Embedding length mismatch: got {len(embedding)}, "
                f"expected {self._dimension}"
            )

    # =========================================================================
    # articles
    # =========================================================================

    def insert_article(
        self,
        news_id: str,
        metadata: Dict[str, Any],
        embedding: List[float],
    ) -> None:
        """Insert a raw article. Idempotent via ``ON CONFLICT DO NOTHING``.

        ``metadata`` must supply ``title``; ``category`` and ``published_at``
        are optional top-level columns. Any remaining keys go into the
        ``metadata`` JSONB column.

        DO NOTHING prevents accidental re-trigger of Core 2 transform on
        re-collected articles — once a news_id is present we keep its
        existing row (which may already be ``status='transformed'``). Use
        ``update_article_status`` for deliberate transitions and a future
        dedicated method (not this one) for metadata edits.
        """
        self._validate_embedding(embedding)
        if not self._enabled:
            return
        try:
            meta = dict(metadata or {})
            title = meta.pop("title", "")
            category = meta.pop("category", None)
            published_at = meta.pop("published_at", None)
            self.conn.run(
                """
                INSERT INTO articles
                    (news_id, status, title, category, published_at, embedding, metadata)
                VALUES
                    (:news_id, 'raw', :title, :category, :published_at,
                     :embedding::vector, :metadata::jsonb)
                ON CONFLICT (news_id) DO NOTHING
                """,
                news_id=news_id,
                title=title,
                category=category,
                published_at=published_at,
                embedding=_vec_literal(embedding),
                metadata=json.dumps(meta, default=_json_default, ensure_ascii=False),
            )
        except Exception as exc:
            logger.warning(f"insert_article({news_id!r}) failed: {exc}")

    def update_article_status(self, news_id: str, status: str) -> None:
        """Transition an article's ``status`` column and bump ``updated_at``.

        Raises ``ValueError`` for out-of-range status values (server-side
        CHECK would also reject, but failing fast avoids a round-trip).
        """
        if status not in _ARTICLE_STATUSES:
            raise ValueError(
                f"Invalid status: {status!r}. Must be one of {_ARTICLE_STATUSES}"
            )
        if not self._enabled:
            return
        try:
            self.conn.run(
                "UPDATE articles SET status = :status, updated_at = now() "
                "WHERE news_id = :nid",
                status=status,
                nid=news_id,
            )
        except Exception as exc:
            logger.error(
                f"update_article_status({news_id!r}, {status!r}) failed: {exc}",
                exc_info=True,
            )

    def get_articles_by_status(
        self,
        status: str,
        limit: int = 100,
    ) -> List[Dict[str, Any]]:
        """Return articles with ``status``, oldest first (FIFO for Core 2)."""
        if not self._enabled:
            return []
        try:
            rows = self.conn.run(
                """
                SELECT news_id, status, title, category, published_at, metadata,
                       created_at, updated_at
                FROM articles
                WHERE status = :status
                ORDER BY created_at ASC
                LIMIT :lim
                """,
                status=status,
                lim=limit,
            )
            return [
                {
                    "news_id": r[0],
                    "status": r[1],
                    "title": r[2],
                    "category": r[3],
                    "published_at": r[4],
                    "metadata": r[5],
                    "created_at": r[6],
                    "updated_at": r[7],
                }
                for r in rows
            ]
        except Exception as exc:
            logger.warning(f"get_articles_by_status({status!r}) failed: {exc}")
            return []

    def find_similar_articles(
        self,
        embedding: List[float],
        limit: int = 10,
    ) -> List[Dict[str, Any]]:
        """Cosine-nearest articles (pre-MBTI embedding).

        Restricted to ``status='transformed'`` so callers never surface a
        raw or failed article. Used for "related articles" UI, not feed
        ranking (use ``find_feed_candidates`` for that).
        """
        self._validate_embedding(embedding)
        if not self._enabled:
            return []
        try:
            vec = _vec_literal(embedding)
            rows = self.conn.run(
                """
                SELECT news_id, title, category, published_at, metadata,
                       embedding <=> :q::vector AS distance
                FROM articles
                WHERE status = 'transformed'
                ORDER BY embedding <=> :q::vector
                LIMIT :lim
                """,
                q=vec,
                lim=limit,
            )
            return [
                {
                    "news_id": r[0],
                    "title": r[1],
                    "category": r[2],
                    "published_at": r[3],
                    "metadata": r[4],
                    "distance": float(r[5]) if r[5] is not None else None,
                }
                for r in rows
            ]
        except Exception as exc:
            logger.warning(f"find_similar_articles failed: {exc}")
            return []

    def filter_existing_news_ids(self, news_ids: List[str]) -> set:
        """Return the subset of ``news_ids`` already present in ``articles``.

        Used by Core 1 Collector to skip Bedrock + S3 writes for duplicates.
        ``insert_article`` already has ``ON CONFLICT (news_id) DO NOTHING``,
        so this is strictly a cost-saver for the upstream embed/S3 steps —
        correctness still holds if the method returns the empty set.

        Empty input short-circuits to avoid pg8000's empty-array type
        inference brittleness (see the SAFETY comment in
        ``find_feed_candidates`` about ``<> ALL(ARRAY[]::text[])``). For
        non-empty input the Python list binds to ``text[]`` the same way
        ``find_feed_candidates.excl`` does — pg8000 handles the cast once
        the list has at least one element.

        Fail-open semantics: if the query raises (DB down, transient
        network error), returns an empty set so the caller treats every
        candidate as "new" and relies on ``ON CONFLICT DO NOTHING`` for
        dedup at insert time. A logged warning records the failure.
        """
        if not self._enabled or not news_ids:
            return set()
        try:
            rows = self.conn.run(
                "SELECT news_id FROM articles WHERE news_id = ANY(:ids::text[])",
                ids=list(news_ids),
            )
            return {r[0] for r in rows}
        except Exception as exc:
            logger.warning(f"filter_existing_news_ids failed: {exc}")
            return set()

    # =========================================================================
    # article_versions
    # =========================================================================

    def insert_article_version(
        self,
        news_id: str,
        mbti_type: str,
        metadata: Dict[str, Any],
        embedding: List[float],
    ) -> str:
        """Upsert one MBTI version. Returns the row's ``version_id`` UUID.

        ``ON CONFLICT (news_id, mbti_type) DO UPDATE`` makes Core 2
        Transform retries safe: re-running with an improved prompt
        overwrites the prior version in place. This is intentionally
        stricter than ``insert_article`` — versions *should* be replaced
        when we re-transform; originals should not.

        ``metadata`` must supply ``title`` and ``body``; the rest goes
        into the ``metadata`` JSONB column.

        Accepts either full MBTI (``INTJ``) or a 2-char group
        (``NT``) via ``_normalize_mbti_group``.
        """
        group = _normalize_mbti_group(mbti_type)
        self._validate_embedding(embedding)
        if not self._enabled:
            return ""
        try:
            meta = dict(metadata or {})
            title = meta.pop("title", "")
            body = meta.pop("body", "")
            rows = self.conn.run(
                """
                INSERT INTO article_versions
                    (news_id, mbti_type, title, body, embedding, metadata)
                VALUES
                    (:news_id, :mbti_type, :title, :body,
                     :embedding::vector, :metadata::jsonb)
                ON CONFLICT (news_id, mbti_type) DO UPDATE SET
                    title     = EXCLUDED.title,
                    body      = EXCLUDED.body,
                    embedding = EXCLUDED.embedding,
                    metadata  = EXCLUDED.metadata
                RETURNING version_id
                """,
                news_id=news_id,
                mbti_type=group,
                title=title,
                body=body,
                embedding=_vec_literal(embedding),
                metadata=json.dumps(meta, default=_json_default, ensure_ascii=False),
            )
            return str(rows[0][0]) if rows else ""
        except Exception as exc:
            logger.warning(
                f"insert_article_version({news_id!r}, {group!r}) failed: {exc}"
            )
            return ""

    def get_article_versions(self, news_id: str) -> Dict[str, Dict[str, Any]]:
        """Return ``{mbti_group: version_dict}`` with 0–4 entries."""
        if not self._enabled:
            return {}
        try:
            rows = self.conn.run(
                """
                SELECT version_id, mbti_type, title, body, metadata, created_at
                FROM article_versions
                WHERE news_id = :nid
                """,
                nid=news_id,
            )
            return {
                r[1]: {
                    "version_id": str(r[0]),
                    "mbti_type": r[1],
                    "title": r[2],
                    "body": r[3],
                    "metadata": r[4],
                    "created_at": r[5],
                }
                for r in rows
            }
        except Exception as exc:
            logger.warning(f"get_article_versions({news_id!r}) failed: {exc}")
            return {}

    # =========================================================================
    # user_profiles
    # =========================================================================

    def upsert_user_profile(
        self,
        user_id: str,
        mbti_type: Optional[str],
        category_weights: Optional[Dict[str, float]],
        preference_embedding: Optional[List[float]],
    ) -> None:
        """Insert-or-update a profile. ``mbti_type`` and embedding may be NULL.

        The 4-char ``mbti_type`` is stored verbatim (schema CHECK enforces
        the 16-value set). ``category_weights`` defaults to ``{}`` so the
        JSONB column stays non-null even during cold-start.

        Two explicit SQL paths rather than a single ``CASE WHEN :vec IS
        NULL THEN NULL ELSE :vec::vector END`` — PostgreSQL cannot infer
        the type of a bare parameter inside that CASE (error 42P08
        "could not determine data type of parameter"), because neither
        branch supplies type information for ``:vec`` itself before the
        cast runs. The pre-cast parameter is inspected for the IS NULL
        check, and the server refuses to proceed without a resolved
        type. Branching in Python sidesteps this entirely.
        """
        if preference_embedding is not None:
            self._validate_embedding(preference_embedding)
        if not self._enabled:
            return
        try:
            weights_json = json.dumps(
                category_weights or {},
                default=_json_default,
                ensure_ascii=False,
            )
            if preference_embedding is not None:
                self.conn.run(
                    """
                    INSERT INTO user_profiles
                        (user_id, mbti_type, category_weights, preference_embedding)
                    VALUES
                        (:uid, :mbti, :weights::jsonb, :vec::vector)
                    ON CONFLICT (user_id) DO UPDATE SET
                        mbti_type            = EXCLUDED.mbti_type,
                        category_weights     = EXCLUDED.category_weights,
                        preference_embedding = EXCLUDED.preference_embedding,
                        updated_at           = now()
                    """,
                    uid=user_id,
                    mbti=mbti_type,
                    weights=weights_json,
                    vec=_vec_literal(preference_embedding),
                )
            else:
                self.conn.run(
                    """
                    INSERT INTO user_profiles
                        (user_id, mbti_type, category_weights, preference_embedding)
                    VALUES
                        (:uid, :mbti, :weights::jsonb, NULL)
                    ON CONFLICT (user_id) DO UPDATE SET
                        mbti_type            = EXCLUDED.mbti_type,
                        category_weights     = EXCLUDED.category_weights,
                        preference_embedding = EXCLUDED.preference_embedding,
                        updated_at           = now()
                    """,
                    uid=user_id,
                    mbti=mbti_type,
                    weights=weights_json,
                )
        except Exception as exc:
            logger.warning(f"upsert_user_profile({user_id!r}) failed: {exc}")

    def get_user_profile(self, user_id: str) -> Optional[Dict[str, Any]]:
        """Return the profile dict or ``None`` if missing.

        ``preference_embedding`` is intentionally omitted from the select
        list — it's a 1024-float column used only inside SQL joins, not by
        application code. Phase 3 Memory Manager may add an
        ``include_embedding`` parameter (or a dedicated method) if a
        consumer actually needs the raw vector in Python.
        """
        if not self._enabled:
            return None
        try:
            rows = self.conn.run(
                """
                SELECT user_id, mbti_type, category_weights, created_at, updated_at
                FROM user_profiles
                WHERE user_id = :uid
                LIMIT 1
                """,
                uid=user_id,
            )
            if not rows:
                return None
            r = rows[0]
            return {
                "user_id": r[0],
                "mbti_type": r[1],
                "category_weights": r[2],
                "created_at": r[3],
                "updated_at": r[4],
            }
        except Exception as exc:
            logger.warning(f"get_user_profile({user_id!r}) failed: {exc}")
            return None

    def get_preference_embedding(self, user_id: str) -> Optional[List[float]]:
        """Read the user's stored ``preference_embedding`` as a Python list.

        Separate from ``get_user_profile`` because that method intentionally
        omits the 1024-float vector to keep its result small (it's used for
        UI / metadata display). This method is for the personalization
        pipeline (Recommend Agent Stage 1) which actually needs the vector.

        Returns ``None`` when:
          * the profile row doesn't exist, OR
          * the row exists but ``preference_embedding`` is NULL (cold-start
            users created without a seed — though Round 5-A
            ``MemoryManager.get_or_create_profile`` always seeds, this NULL
            path remains for legacy rows or future code that intentionally
            stores a NULL).

        Why ``::text`` cast instead of native vector
        --------------------------------------------
        ``pg8000`` has no native pgvector type adapter — vector columns
        come back as opaque objects. Casting to text on the SQL side
        produces the canonical pgvector literal ``[v1,v2,...,vN]`` which
        we parse with a tight ``split(',')`` loop. The dimension is fixed
        (1024) so the parsing cost is negligible compared to round-trip
        latency.
        """
        if not self._enabled:
            return None
        try:
            rows = self.conn.run(
                """
                SELECT preference_embedding::text
                FROM user_profiles
                WHERE user_id = :uid
                  AND preference_embedding IS NOT NULL
                LIMIT 1
                """,
                uid=user_id,
            )
            if not rows:
                return None
            literal = rows[0][0]
            # pgvector text repr: "[0.1,0.2,...,0.9]". Strip brackets,
            # split on comma, parse to float. No quoting/escaping concern
            # because all values are floats (no commas inside elements).
            inner = literal.strip()
            if inner.startswith("[") and inner.endswith("]"):
                inner = inner[1:-1]
            if not inner:
                return []
            return [float(x) for x in inner.split(",")]
        except Exception as exc:
            logger.warning(
                f"get_preference_embedding({user_id!r}) failed: {exc}"
            )
            return None

    # =========================================================================
    # user_interactions
    # =========================================================================

    def record_interaction(
        self,
        user_id: str,
        news_id: str,
        mbti_type: Optional[str],
        interaction_type: str,
        **kwargs: Any,
    ) -> None:
        """Log a single interaction event.

        Known kwargs — ``dwell_ms``, ``scroll_pct``, ``rating``,
        ``reaction_type`` — map to their dedicated columns so Stage 2
        ranking can ``AVG``/``COUNT FILTER`` without JSONB path casts.
        Any other kwargs land in the ``metadata`` JSONB column and are
        passed through ``_json_default`` (datetime/Decimal/set tolerated).

        ``mbti_type`` is optional — a 'skip' event may have no version.
        Note: Phase 3 aggregations that group by version must exclude
        NULL rows, e.g.
        ``COUNT(*) FILTER (WHERE mbti_type IS NOT NULL)``.
        """
        if interaction_type not in _INTERACTION_TYPES:
            raise ValueError(
                f"Invalid interaction_type: {interaction_type!r}. "
                f"Must be one of {_INTERACTION_TYPES}"
            )
        group = _normalize_mbti_group(mbti_type) if mbti_type else None
        if not self._enabled:
            return
        try:
            col_values = {col: kwargs.pop(col, None) for col in _INTERACTION_COLUMNS}
            metadata = kwargs  # leftover kwargs → JSONB
            self.conn.run(
                """
                INSERT INTO user_interactions
                    (user_id, news_id, mbti_type, interaction_type,
                     dwell_ms, scroll_pct, rating, reaction_type, metadata)
                VALUES
                    (:uid, :nid, :mbti, :itype,
                     :dwell_ms, :scroll_pct, :rating, :reaction_type,
                     :metadata::jsonb)
                """,
                uid=user_id,
                nid=news_id,
                mbti=group,
                itype=interaction_type,
                dwell_ms=col_values["dwell_ms"],
                scroll_pct=col_values["scroll_pct"],
                rating=col_values["rating"],
                reaction_type=col_values["reaction_type"],
                metadata=json.dumps(
                    metadata, default=_json_default, ensure_ascii=False
                ),
            )
        except Exception as exc:
            logger.warning(
                f"record_interaction({user_id!r}, {news_id!r}) failed: {exc}"
            )

    def get_user_interactions(
        self,
        user_id: str,
        limit: int = 100,
        since: Optional[datetime] = None,
    ) -> List[Dict[str, Any]]:
        """Return newest-first interaction rows, optionally filtered by time."""
        if not self._enabled:
            return []
        try:
            if since is not None:
                rows = self.conn.run(
                    """
                    SELECT id, user_id, news_id, mbti_type, interaction_type,
                           dwell_ms, scroll_pct, rating, reaction_type,
                           metadata, created_at
                    FROM user_interactions
                    WHERE user_id = :uid AND created_at >= :since
                    ORDER BY created_at DESC
                    LIMIT :lim
                    """,
                    uid=user_id,
                    since=since,
                    lim=limit,
                )
            else:
                rows = self.conn.run(
                    """
                    SELECT id, user_id, news_id, mbti_type, interaction_type,
                           dwell_ms, scroll_pct, rating, reaction_type,
                           metadata, created_at
                    FROM user_interactions
                    WHERE user_id = :uid
                    ORDER BY created_at DESC
                    LIMIT :lim
                    """,
                    uid=user_id,
                    lim=limit,
                )
            return [
                {
                    "id": r[0],
                    "user_id": r[1],
                    "news_id": r[2],
                    "mbti_type": r[3],
                    "interaction_type": r[4],
                    "dwell_ms": r[5],
                    "scroll_pct": r[6],
                    "rating": r[7],
                    "reaction_type": r[8],
                    "metadata": r[9],
                    "created_at": r[10],
                }
                for r in rows
            ]
        except Exception as exc:
            logger.warning(f"get_user_interactions({user_id!r}) failed: {exc}")
            return []

    def find_active_users_since(
        self,
        cutoff: datetime,
        limit: int = 10000,
    ) -> List[str]:
        """Return distinct user_ids with at least one interaction since
        ``cutoff``. Used by the consolidation Lambda to scope its work
        to actively-engaged users — inactive users keep their seeded
        embedding unchanged (Q3 = B in Round 5-D).

        ``limit`` is a safety rail; default 10k handles dev-size dataset
        comfortably. If the number of active users exceeds the limit
        the consolidation Lambda will silently miss the tail — log
        a warning but don't fail. Production scaling beyond 10k would
        warrant a chunked approach (out of Round 5-D scope).
        """
        if not self._enabled:
            return []
        try:
            rows = self.conn.run(
                """
                SELECT DISTINCT user_id
                FROM user_interactions
                WHERE created_at >= :cutoff
                ORDER BY user_id
                LIMIT :lim
                """,
                cutoff=cutoff,
                lim=limit,
            )
            users = [r[0] for r in rows]
            if len(users) >= limit:
                logger.warning(
                    f"find_active_users_since hit limit={limit}; tail "
                    f"users may not be consolidated this run."
                )
            return users
        except Exception as exc:
            logger.warning(f"find_active_users_since failed: {exc}")
            return []

    def get_interaction_centroid_data(
        self,
        user_id: str,
        since: datetime,
    ) -> Dict[str, Any]:
        """Aggregate a user's interactions for consolidation.

        Single round-trip that returns the data Round 5-D consolidate
        needs — interaction centroid (mean of article embeddings for
        distinct news_ids the user touched) plus per-event detail
        rows (interaction_type, dwell_ms, rating, category) for
        category_weights computation.

        Returns shape::

            {
                "distinct_news_count": <int>,  # how many distinct news_ids
                                               # touched in window
                "centroid_embedding": <List[float] | None>,
                                               # element-wise mean of
                                               # articles.embedding for
                                               # those distinct ids;
                                               # None if zero ids or
                                               # all embeddings null
                "events": [
                    {
                        "news_id": ...,
                        "interaction_type": ...,
                        "dwell_ms": ...,
                        "rating": ...,
                        "category": ...,        # from articles.metadata
                                                # via the JOIN
                    },
                    ...
                ],
            }

        ``events`` is a flat list of every interaction (not deduped),
        because category_weights summation needs the full event stream
        — a user clicking the same article twice should count twice
        for "this category gets +2 click weight". distinct_news_count
        comes from a separate aggregation on the same data so the
        EWMA threshold check (≥10 distinct) and the events list stay
        consistent.

        The embedding centroid uses ``articles.embedding`` (the source
        article-level embedding), not ``article_versions.embedding``,
        because a user's preference is over articles regardless of
        which MBTI variant they read. Variant-level signal is
        captured by the user already having an MBTI-specific
        category_weights distribution.
        """
        if not self._enabled:
            return {
                "distinct_news_count": 0,
                "centroid_embedding": None,
                "events": [],
            }
        try:
            # Two queries: one to get the events list with article
            # metadata for category aggregation, one to compute the
            # centroid via SQL aggregation (avoiding shipping every
            # 1024-dim vector across the wire).
            event_rows = self.conn.run(
                """
                SELECT ui.news_id, ui.interaction_type, ui.dwell_ms,
                       ui.rating,
                       a.metadata->>'category' AS category
                FROM user_interactions ui
                JOIN articles a ON a.news_id = ui.news_id
                WHERE ui.user_id = :uid
                  AND ui.created_at >= :since
                ORDER BY ui.created_at ASC
                """,
                uid=user_id,
                since=since,
            )
            events = [
                {
                    "news_id": r[0],
                    "interaction_type": r[1],
                    "dwell_ms": r[2],
                    "rating": r[3],
                    "category": r[4],
                }
                for r in event_rows
            ]

            # Distinct news count from the event list (avoid second
            # round-trip — small in-Python work).
            distinct_news_ids = {e["news_id"] for e in events if e["news_id"]}

            centroid: Optional[List[float]] = None
            if distinct_news_ids:
                # AVG over vectors via pgvector. Skip articles where
                # embedding IS NULL so the average is over the actual
                # population. avg() of vector returns vector;
                # cast to text for parsing identical to
                # get_preference_embedding.
                centroid_rows = self.conn.run(
                    """
                    SELECT AVG(embedding)::text
                    FROM articles
                    WHERE news_id = ANY(:ids::text[])
                      AND embedding IS NOT NULL
                    """,
                    ids=list(distinct_news_ids),
                )
                if centroid_rows and centroid_rows[0][0] is not None:
                    literal = centroid_rows[0][0].strip()
                    if literal.startswith("[") and literal.endswith("]"):
                        literal = literal[1:-1]
                    if literal:
                        try:
                            centroid = [float(x) for x in literal.split(",")]
                        except ValueError:
                            logger.warning(
                                f"get_interaction_centroid_data: failed to "
                                f"parse centroid for user_id={user_id!r}"
                            )

            return {
                "distinct_news_count": len(distinct_news_ids),
                "centroid_embedding": centroid,
                "events": events,
            }
        except Exception as exc:
            logger.warning(
                f"get_interaction_centroid_data({user_id!r}) failed: {exc}"
            )
            return {
                "distinct_news_count": 0,
                "centroid_embedding": None,
                "events": [],
            }

    # =========================================================================
    # feed ranking
    # =========================================================================

    def find_feed_candidates(
        self,
        user_mbti: str,
        preference_embedding: Optional[List[float]],
        exclude_news_ids: List[str],
        limit: int = 100,
    ) -> List[Dict[str, Any]]:
        """Return candidate article versions for the user's MBTI group.

        Joins ``article_versions`` with ``articles`` so the caller receives
        the version body plus article metadata (``category``,
        ``published_at``) in one round-trip. Restricted to
        ``articles.status = 'transformed'`` for safety against partial
        pipeline state.

        Cold-start path: if ``preference_embedding`` is ``None``, falls
        back to recency-based ranking within the user's MBTI version.
        Phase 3 will extend this to a popularity + recency combination.

        ``exclude_news_ids`` filters out news_ids the user has already
        seen; an empty list skips the clause entirely (no-op filter).

        ``user_mbti`` accepts full 16-value MBTI (``INTJ``) or 2-char
        group (``NT``).
        """
        group = _normalize_mbti_group(user_mbti)
        exclude = list(exclude_news_ids or [])
        if preference_embedding is not None:
            self._validate_embedding(preference_embedding)
        if not self._enabled:
            return []

        # SAFETY: this query is the only f-string SQL in this module.
        # The three interpolated fragments below — ``select_distance``,
        # ``order_by``, ``where_exclude`` — are each picked from at most
        # two hard-coded string literals defined in this function. No
        # argument, env var, column value, or user input reaches the
        # f-string; real values travel via ``:grp / :lim / :pref /
        # :excl`` parameter bindings. We assemble SQL this way only
        # because pg8000 empty-array type inference is brittle for
        # ``<> ALL(ARRAY[]::text[])`` — we'd rather omit the clause
        # than rely on it.
        if preference_embedding is not None:
            select_distance = "av.embedding <=> :pref::vector AS distance"
            order_by = "ORDER BY av.embedding <=> :pref::vector"
        else:
            select_distance = "NULL::float8 AS distance"
            order_by = "ORDER BY a.published_at DESC NULLS LAST"

        where_exclude = (
            "AND av.news_id <> ALL(:excl::text[])" if exclude else ""
        )

        sql = f"""
            SELECT av.news_id, av.mbti_type, av.title, av.body,
                   av.metadata AS version_metadata, av.created_at,
                   a.category, a.published_at,
                   a.metadata AS article_metadata,
                   {select_distance}
            FROM article_versions av
            JOIN articles a ON a.news_id = av.news_id
            WHERE av.mbti_type = :grp
              AND a.status = 'transformed'
              {where_exclude}
            {order_by}
            LIMIT :lim
        """

        params: Dict[str, Any] = {"grp": group, "lim": limit}
        if preference_embedding is not None:
            params["pref"] = _vec_literal(preference_embedding)
        if exclude:
            params["excl"] = exclude

        try:
            rows = self.conn.run(sql, **params)
            return [
                {
                    "news_id": r[0],
                    "mbti_type": r[1],
                    "title": r[2],
                    "body": r[3],
                    "version_metadata": r[4],
                    "created_at": r[5],
                    "category": r[6],
                    "published_at": r[7],
                    "article_metadata": r[8],
                    "distance": float(r[9]) if r[9] is not None else None,
                }
                for r in rows
            ]
        except Exception as exc:
            logger.warning(f"find_feed_candidates({user_mbti!r}) failed: {exc}")
            return []

    def get_version_embeddings(
        self,
        news_ids: List[str],
        mbti_group: str,
    ) -> Dict[str, List[float]]:
        """Fetch ``article_versions.embedding`` for specific (news_id, group) pairs.

        Returns ``{news_id: [1024 floats]}``. Missing news_ids (no
        version row, mismatched group, or NULL embedding) are simply
        absent from the output dict — caller treats absence as "no
        embedding available" without distinguishing the cause.

        Used by Recommend Agent Stage 3 (MMR) where pairwise cosine
        similarity between candidates is needed. ``find_feed_candidates``
        intentionally omits the embedding column to keep its row size
        small for the common (Stage 1) path; this method is the explicit
        opt-in for callers that need the vector.

        Bandwidth note
        --------------
        At typical batch size (≤100 candidates) and 1024-dim float32
        encoded as pgvector text repr, payload is ~1-2 MB per call.
        Acceptable for a per-request Stage 3 call. If profiling shows
        this dominating latency, options are: (a) reduce candidate_limit,
        (b) approximate MMR with score-only diversity, (c) switch to a
        driver with native vector binary protocol (pg8000 has none).

        ``mbti_group`` accepts full MBTI (``INTJ``) or 2-char group
        (``NT``) via ``_normalize_mbti_group``.
        """
        if not news_ids:
            return {}
        if not self._enabled:
            return {}
        group = _normalize_mbti_group(mbti_group)
        try:
            rows = self.conn.run(
                """
                SELECT news_id, embedding::text
                FROM article_versions
                WHERE news_id = ANY(:ids::text[])
                  AND mbti_type = :grp
                  AND embedding IS NOT NULL
                """,
                ids=list(news_ids),
                grp=group,
            )
            out: Dict[str, List[float]] = {}
            for r in rows:
                news_id, literal = r[0], r[1]
                inner = literal.strip()
                if inner.startswith("[") and inner.endswith("]"):
                    inner = inner[1:-1]
                if not inner:
                    continue
                try:
                    out[news_id] = [float(x) for x in inner.split(",")]
                except ValueError:
                    # Defensive: malformed pgvector literal. Skip this
                    # row, keep the others. Logged so we can detect
                    # data-corruption patterns in CloudWatch.
                    logger.warning(
                        f"get_version_embeddings: failed to parse vector "
                        f"for news_id={news_id!r}"
                    )
            return out
        except Exception as exc:
            logger.warning(
                f"get_version_embeddings({len(news_ids)} ids, {mbti_group!r}) "
                f"failed: {exc}"
            )
            return {}

    # =========================================================================
    # article_selections (Phase 2.5 — Selection + Minimal Feed)
    # =========================================================================

    def find_unscored_articles(
        self,
        selection_date: date,
        limit: int = 200,
    ) -> List[Dict[str, Any]]:
        """Return raw articles created on ``selection_date`` (KST) that have
        NO scoring rows yet for any MBTI on that date.

        Used by the Selector at the start of each run. Excludes:
          * articles already scored on this date (any MBTI) — selection
            is per-day, so once an article is scored today the Selector
            never re-scores it (Q4 = (B), TASKS.md Phase 2.5).
          * articles whose status has moved past raw (transformed/failed)
            — those have been processed by Core 2 already.

        Date filter
        -----------
        ``DATE(created_at AT TIME ZONE 'Asia/Seoul') = :sel_date``
        materializes the KST calendar day at query time. Cheaper than a
        separate kst_date column and uses no functional index — at the
        target traffic (a few thousand raws/day) the seq scan is bounded
        and fast.

        Returns
        -------
        List of dicts identical to ``get_articles_by_status('raw')``
        output shape, plus ``content_preview`` extracted from
        ``metadata->>'content_preview'`` for direct use by the Selector
        without a second JSONB hop. Articles whose metadata lacks
        ``content_preview`` come back with an empty string — the
        Selector handler must skip those (Q5 = (A), pre-TASK-4-A
        backlog will be empty until the next collector cycle fills it).
        """
        if not self._enabled:
            return []
        try:
            rows = self.conn.run(
                """
                SELECT a.news_id, a.status, a.title, a.category,
                       a.published_at, a.metadata, a.created_at, a.updated_at,
                       COALESCE(a.metadata->>'content_preview', '') AS preview
                FROM articles a
                WHERE a.status = 'raw'
                  AND DATE(a.created_at AT TIME ZONE 'Asia/Seoul') = :sel_date
                  AND NOT EXISTS (
                      SELECT 1 FROM article_selections s
                      WHERE s.news_id = a.news_id
                        AND s.selection_date = :sel_date
                  )
                ORDER BY a.created_at ASC
                LIMIT :lim
                """,
                sel_date=selection_date,
                lim=int(limit),
            )
            return [
                {
                    "news_id": r[0],
                    "status": r[1],
                    "title": r[2],
                    "category": r[3],
                    "published_at": r[4],
                    "metadata": r[5],
                    "created_at": r[6],
                    "updated_at": r[7],
                    "content_preview": r[8],
                }
                for r in rows
            ]
        except Exception as exc:
            logger.warning(
                f"find_unscored_articles({selection_date},limit={limit}) "
                f"failed: {exc}"
            )
            return []

    def upsert_selection_score(
        self,
        news_id: str,
        mbti_type: str,
        selection_date: date,
        mbti_score: float,
        composite_score: float,
        quality_score: Optional[float] = None,
    ) -> None:
        """Insert or update one per-MBTI score row for a candidate article.

        On re-run within the same day the three score columns and scored_at
        are overwritten; selected and transformed_at are preserved so an
        article that has already been transformed stays transformed when
        its scores refresh. Accepts full MBTI (INTJ) or 2-char group (NT).
        """
        group = _normalize_mbti_group(mbti_type)
        if not self._enabled:
            return
        try:
            self.conn.run(
                """
                INSERT INTO article_selections
                    (news_id, mbti_type, selection_date,
                     mbti_score, quality_score, composite_score)
                VALUES
                    (:news_id, :mbti_type, :selection_date,
                     :mbti_score, :quality_score, :composite_score)
                ON CONFLICT (news_id, mbti_type, selection_date)
                DO UPDATE SET
                    mbti_score      = EXCLUDED.mbti_score,
                    quality_score   = EXCLUDED.quality_score,
                    composite_score = EXCLUDED.composite_score,
                    scored_at       = now()
                """,
                news_id=news_id,
                mbti_type=group,
                selection_date=selection_date,
                mbti_score=float(mbti_score),
                quality_score=(
                    float(quality_score) if quality_score is not None else None
                ),
                composite_score=float(composite_score),
            )
        except Exception as exc:
            logger.warning(
                f"upsert_selection_score({news_id!r},{group},{selection_date}) "
                f"failed: {exc}"
            )

    def rerank_selections(
        self,
        selection_date: date,
        mbti_type: str,
        top_n: int = 20,
    ) -> int:
        """Re-rank (date, mbti) partition; flag top N selected, rest not.

        Single SQL statement (CTE + UPDATE with RETURNING) so no transient
        partial-flag state is visible. transformed_at is preserved across
        selected flips — re-entering top N on a later same-day run skips
        re-transform. Returns count left with selected=TRUE.
        """
        group = _normalize_mbti_group(mbti_type)
        if not self._enabled:
            return 0
        try:
            rows = self.conn.run(
                """
                WITH ranked AS (
                    SELECT id,
                           ROW_NUMBER() OVER (
                               ORDER BY composite_score DESC, scored_at ASC
                           ) AS rn
                    FROM article_selections
                    WHERE selection_date = :d AND mbti_type = :g
                )
                UPDATE article_selections s
                   SET selected = (r.rn <= :n)
                  FROM ranked r
                 WHERE s.id = r.id
             RETURNING s.selected
                """,
                d=selection_date,
                g=group,
                n=int(top_n),
            )
            return sum(1 for r in rows if r[0])
        except Exception as exc:
            logger.warning(
                f"rerank_selections({selection_date},{group},top_n={top_n}) "
                f"failed: {exc}"
            )
            return 0

    def get_transform_queue(
        self,
        limit: int = 20,
    ) -> List[Dict[str, Any]]:
        """Return selected rows still awaiting transform, oldest-scored first.

        JOIN articles for title/category/published_at/metadata so the
        Transform worker gets everything in one round-trip. FIFO by
        scored_at ASC; partial index idx_selections_transform_queue
        keeps the scan at O(pending).
        """
        if not self._enabled:
            return []
        try:
            rows = self.conn.run(
                """
                SELECT s.id, s.news_id, s.mbti_type, s.selection_date,
                       s.composite_score, s.scored_at,
                       a.title, a.category, a.published_at, a.metadata
                FROM article_selections s
                JOIN articles a ON a.news_id = s.news_id
                WHERE s.selected = TRUE AND s.transformed_at IS NULL
                ORDER BY s.scored_at ASC
                LIMIT :n
                """,
                n=int(limit),
            )
            return [
                {
                    "selection_id": r[0],
                    "news_id": r[1],
                    "mbti_type": r[2],
                    "selection_date": r[3],
                    "composite_score": float(r[4]),
                    "scored_at": r[5],
                    "title": r[6],
                    "category": r[7],
                    "published_at": r[8],
                    "article_metadata": r[9],
                }
                for r in rows
            ]
        except Exception as exc:
            logger.warning(f"get_transform_queue(limit={limit}) failed: {exc}")
            return []

    def mark_transformed(
        self,
        news_id: str,
        mbti_type: str,
        selection_date: date,
    ) -> None:
        """Stamp transformed_at = now() on one selection row.

        Silent no-op if the row doesn't exist (race insurance against
        re-rank between polling and completion). Errors go to logger.error
        with exc_info because a missed stamp leaks a phantom pending row
        forever — stricter than other warning-only swallows.
        """
        group = _normalize_mbti_group(mbti_type)
        if not self._enabled:
            return
        try:
            self.conn.run(
                """
                UPDATE article_selections
                   SET transformed_at = now()
                 WHERE news_id = :nid
                   AND mbti_type = :g
                   AND selection_date = :d
                """,
                nid=news_id,
                g=group,
                d=selection_date,
            )
        except Exception as exc:
            logger.error(
                f"mark_transformed({news_id!r},{group},{selection_date}) "
                f"failed: {exc}",
                exc_info=True,
            )

    # =========================================================================
    # Phase 5 retry-limit (validation_failure_count cost cap)
    # =========================================================================

    def ensure_phase5_schema(self) -> None:
        """Idempotent additive migration: article_selections.validation_failure_count.

        Called once per cold start by the Transform Lambda. ``ADD COLUMN IF
        NOT EXISTS`` makes the second-and-later runs a no-op (PostgreSQL
        9.6+). Default 0 lets the row backfill cost stay bounded — Postgres
        11+ stores the default in pg_attribute without touching existing
        rows on the ALTER, so this is fast even on a populated table.

        Why here and not in ``init_pgvector_v2.py``: that script is a CLI
        tool the human operator runs from outside the VPC. The RDS instance
        sits in a private subnet, so the column has to be added from a
        Lambda that already has VPC + Secrets Manager access. Idempotency
        keeps it safe to live on the cold-start path indefinitely.
        """
        if not self._enabled:
            return
        try:
            self.conn.run(
                """
                ALTER TABLE article_selections
                ADD COLUMN IF NOT EXISTS validation_failure_count INTEGER NOT NULL DEFAULT 0
                """
            )
        except Exception as exc:
            logger.warning(
                f"ensure_phase5_schema (ALTER TABLE article_selections) failed: {exc}"
            )

    def increment_validation_failure_count(
        self,
        news_id: str,
        mbti_type: str,
        selection_date: date,
    ) -> int:
        """``validation_failure_count += 1`` on the matching selection row,
        return the new count. Returns 0 if the row is missing or the update
        otherwise no-ops (defensive; feeds straight into the retry-limit
        comparison so a missing row should NOT trigger a force-release).
        """
        group = _normalize_mbti_group(mbti_type)
        if not self._enabled:
            return 0
        try:
            rows = self.conn.run(
                """
                UPDATE article_selections
                   SET validation_failure_count = validation_failure_count + 1
                 WHERE news_id = :nid
                   AND mbti_type = :g
                   AND selection_date = :d
                RETURNING validation_failure_count
                """,
                nid=news_id,
                g=group,
                d=selection_date,
            )
            if rows:
                return int(rows[0][0])
            return 0
        except Exception as exc:
            logger.warning(
                f"increment_validation_failure_count({news_id!r},{group},"
                f"{selection_date}) failed: {exc}"
            )
            return 0

    def force_transformed_at_for_retry_limit(
        self,
        news_id: str,
        mbti_type: str,
        selection_date: date,
    ) -> bool:
        """Stamp transformed_at = now() to break out of an infinite retry
        loop after ``validation_failure_count`` reaches the limit.

        Returns ``True`` if a row was updated, ``False`` otherwise. Only
        flips rows still ``transformed_at IS NULL`` so a successful retry
        race doesn't get clobbered.

        Article_versions remains absent for this (news_id, mbti_type) pair,
        so the feed query (INNER JOIN article_versions) keeps it hidden
        from frontend even though the selection row is now "complete" from
        the transform queue's perspective.
        """
        group = _normalize_mbti_group(mbti_type)
        if not self._enabled:
            return False
        try:
            rows = self.conn.run(
                """
                UPDATE article_selections
                   SET transformed_at = now()
                 WHERE news_id = :nid
                   AND mbti_type = :g
                   AND selection_date = :d
                   AND transformed_at IS NULL
                RETURNING 1
                """,
                nid=news_id,
                g=group,
                d=selection_date,
            )
            return bool(rows)
        except Exception as exc:
            logger.warning(
                f"force_transformed_at_for_retry_limit({news_id!r},{group},"
                f"{selection_date}) failed: {exc}"
            )
            return False

    def get_feed(
        self,
        mbti_type: str,
        limit: int = 20,
        since_date: Optional[date] = None,
    ) -> List[Dict[str, Any]]:
        """Return the feed payload for one MBTI group.

        JOIN article_selections + articles + article_versions, filtered to
        selected + transformed within since_date window (default: today
        KST minus 7 days). ORDER BY selection_date DESC, composite_score
        DESC. Empty list on error or when disabled.
        """
        group = _normalize_mbti_group(mbti_type)
        if not self._enabled:
            return []
        if since_date is None:
            kst = timezone(timedelta(hours=9))
            since_date = datetime.now(kst).date() - timedelta(days=7)
        try:
            rows = self.conn.run(
                """
                SELECT s.news_id, s.mbti_type, s.selection_date,
                       s.composite_score, s.transformed_at,
                       a.category, a.published_at, a.metadata,
                       av.title, av.body, av.metadata
                FROM article_selections s
                JOIN articles a ON a.news_id = s.news_id
                JOIN article_versions av
                     ON av.news_id = s.news_id
                    AND av.mbti_type = s.mbti_type
                WHERE s.selected = TRUE
                  AND s.transformed_at IS NOT NULL
                  AND s.mbti_type = :g
                  AND s.selection_date >= :cutoff
                ORDER BY s.selection_date DESC, s.composite_score DESC
                LIMIT :n
                """,
                g=group,
                cutoff=since_date,
                n=int(limit),
            )
            return [
                {
                    "news_id": r[0],
                    "mbti_type": r[1],
                    "selection_date": r[2],
                    "composite_score": float(r[3]),
                    "transformed_at": r[4],
                    "category": r[5],
                    "published_at": r[6],
                    "article_metadata": r[7],
                    "version_title": r[8],
                    "version_body": r[9],
                    "version_metadata": r[10],
                }
                for r in rows
            ]
        except Exception as exc:
            logger.warning(f"get_feed({group},limit={limit}) failed: {exc}")
            return []

    def get_article_with_version(
        self,
        news_id: str,
        mbti_type: str,
    ) -> Optional[Dict[str, Any]]:
        """Return one article + its specific MBTI variant in a single JOIN.

        Used by the Article Detail API (TASK-6). Different from
        ``get_article_versions(news_id)`` which returns all 4 MBTI variants
        without article-level metadata; this method returns a single (news_id
        × MBTI) pair plus the original article's metadata fields needed to
        render a detail page (category, published_at, press, url, original
        title).

        Returns ``None`` when:
          * the article does not exist, OR
          * the article exists but has no version for the requested MBTI
            (e.g. the Selector did not pick this article for that group, or
            transform failed for that group only).

        Callers (the Article Detail handler) treat ``None`` as 404. The
        partial-MBTI failure semantics from TASK-5 mean a 404 here can
        legitimately mean "this article was selected for other MBTIs but
        not for yours" — the handler returns a clear "no version available"
        rather than synthesizing one.

        Returns a dict with both the article's source metadata and the
        version's transformed fields. Keeping them flat (vs. nested) so
        the handler can pick exactly the keys the API contract exposes
        without re-shaping nested dicts.
        """
        group = _normalize_mbti_group(mbti_type)
        if not self._enabled:
            return None
        try:
            rows = self.conn.run(
                """
                SELECT a.news_id, a.title AS original_title, a.category,
                       a.published_at, a.metadata AS article_metadata,
                       av.mbti_type, av.title AS version_title,
                       av.body AS version_body, av.metadata AS version_metadata,
                       av.created_at AS version_created_at
                FROM articles a
                JOIN article_versions av
                     ON av.news_id = a.news_id
                    AND av.mbti_type = :g
                WHERE a.news_id = :nid
                LIMIT 1
                """,
                nid=news_id,
                g=group,
            )
            if not rows:
                return None
            r = rows[0]
            return {
                "news_id": r[0],
                "original_title": r[1],
                "category": r[2],
                "published_at": r[3],
                "article_metadata": r[4],
                "mbti_type": r[5],
                "version_title": r[6],
                "version_body": r[7],
                "version_metadata": r[8],
                "version_created_at": r[9],
            }
        except Exception as exc:
            logger.warning(
                f"get_article_with_version({news_id!r},{group}) failed: {exc}"
            )
            return None

    # =========================================================================
    # daily_letters (Core 2.5 Editor Pick)
    # =========================================================================

    def get_editor_pick_candidates(
        self,
        letter_date: str,
        limit: int = 20,
    ) -> List[Dict[str, Any]]:
        """KST letter_date 의 **종이신문 1면 기사** 후보 풀.

        2026-07-24 변경 (사용자 결정): 레터는 "오늘의 1면" 기사로만 쓴다.
        이전에는 article_selections 의 Selector 선별분(지면 전체, MBTI별 top-20)
        을 썼으나, 후보를 1면(metadata.paper_number == '1')으로 한정한다.
        같은 날 /paper 페이지가 보여주는 기사 집합과 정확히 일치한다.

        대상 지면일은 ``letter_date`` 이하의 가장 최근 지면일(MAX) — 주말·휴간
        으로 당일 지면이 없으면 직전 발행일로 fallback (front_page API 와 동일
        규칙). 덕분에 레터가 주말에 끊기지 않는다.

        Transform 완료 여부는 따지지 않음 — Transform 단계가 2026-05-14 부로
        DISABLED 됐고, letter 는 raw snippet 만으로 작성 가능 (페르소나 카드 +
        orchestrator 가 톤 재작성). article_versions 가 있으면 함께 반환
        (LEFT JOIN), 없으면 빈 dict.

        Selector 점수(article_selections)는 있으면 정렬에만 쓴다 (LEFT JOIN) —
        선별되지 않은 1면 기사도 후보에서 빠지지 않는다.

        ORDER BY: ① 지면 톱(paragraph='TOP') 우선, ② composite_score 평균 높은
        순, ③ published_at 최신 순.
        """
        if not self._enabled:
            return []
        try:
            rows = self.conn.run(
                """
                WITH target AS (
                    SELECT MAX(a.metadata->>'paper_date') AS pdate
                    FROM articles a
                    WHERE a.metadata->>'paper_number' = '1'
                      AND COALESCE(a.metadata->>'paper_date', '') <> ''
                      AND a.metadata->>'paper_date' <= replace(:ldate, '-', '')
                ),
                scores AS (
                    SELECT s.news_id,
                           AVG(s.composite_score) AS avg_score
                    FROM article_selections s
                    WHERE s.selected = TRUE
                      AND s.selection_date = :ldate::date
                    GROUP BY s.news_id
                )
                SELECT a.news_id,
                       a.title,
                       a.category,
                       a.metadata,
                       COALESCE(
                           json_object_agg(av.mbti_type, av.body)
                               FILTER (WHERE av.mbti_type IS NOT NULL),
                           '{}'::json
                       ) AS versions_body,
                       COALESCE(
                           json_object_agg(av.mbti_type, av.title)
                               FILTER (WHERE av.mbti_type IS NOT NULL),
                           '{}'::json
                       ) AS versions_title,
                       sc.avg_score,
                       a.published_at
                FROM articles a
                CROSS JOIN target t
                LEFT JOIN scores sc ON sc.news_id = a.news_id
                LEFT JOIN article_versions av ON av.news_id = a.news_id
                WHERE a.metadata->>'paper_number' = '1'
                  AND a.metadata->>'paper_date' = t.pdate
                GROUP BY a.news_id, a.title, a.category, a.metadata,
                         sc.avg_score, a.published_at
                ORDER BY (a.metadata->>'paper_paragraph' = 'TOP') DESC,
                         sc.avg_score DESC NULLS LAST,
                         a.published_at DESC NULLS LAST
                LIMIT :lim
                """,
                ldate=letter_date,
                lim=limit,
            )
            results: List[Dict[str, Any]] = []
            for r in rows:
                meta = r[3] or {}
                if isinstance(meta, str):
                    try:
                        meta = json.loads(meta)
                    except Exception:
                        meta = {}
                versions_body = r[4] or {}
                if isinstance(versions_body, str):
                    try:
                        versions_body = json.loads(versions_body)
                    except Exception:
                        versions_body = {}
                results.append({
                    "article_id": r[0],
                    "title": r[1],
                    "subtitle": meta.get("sub_title") or meta.get("subtitle") or "",
                    "category": r[2],
                    "themes": meta.get("themes") or [],
                    "press": meta.get("press") or "서울경제",
                    "byline": meta.get("byline") or "",
                    "snippet": meta.get("content_preview")
                               or meta.get("summary")
                               or "",
                    "transformed_versions": versions_body,
                    "avg_score": float(r[6]) if r[6] is not None else None,
                    "transformed_at": r[7],
                    # 재시도 스케줄의 freshness 가드용 — 이 후보가 어느 지면일에서
                    # 왔는지 (fallback 여부 판단). YYYYMMDD.
                    "paper_date": meta.get("paper_date"),
                })
            return results
        except Exception as exc:
            logger.warning(
                f"get_editor_pick_candidates({letter_date!r}) failed: {exc}"
            )
            return []

    def insert_daily_letter(self, letter: Dict[str, Any]) -> None:
        """daily_letters 한 row insert. UNIQUE(letter_date, editor_id) idempotent.

        Required keys: letter_date, editor_id, mbti_group, article_id,
                       headline. Optional: subtitle, archetype, theme,
                       closing_line, body_s3_uri, body_inline, keywords,
                       secondary_article_ids, mode, bedrock_usage.
        """
        if not self._enabled:
            return
        try:
            self.conn.run(
                """
                INSERT INTO daily_letters
                    (letter_date, editor_id, mbti_group, article_id,
                     secondary_article_ids, mode, archetype, theme,
                     headline, subtitle, closing_line,
                     body_s3_uri, body_inline, keywords, bedrock_usage)
                VALUES
                    (:ldate, :eid, :grp, :aid,
                     :sec, :mode, :arch, :theme,
                     :head, :sub, :close,
                     :s3, :inline::jsonb, :kw::jsonb, :usage::jsonb)
                ON CONFLICT (letter_date, editor_id) DO UPDATE SET
                    article_id = EXCLUDED.article_id,
                    secondary_article_ids = EXCLUDED.secondary_article_ids,
                    mode = EXCLUDED.mode,
                    archetype = EXCLUDED.archetype,
                    theme = EXCLUDED.theme,
                    headline = EXCLUDED.headline,
                    subtitle = EXCLUDED.subtitle,
                    closing_line = EXCLUDED.closing_line,
                    body_s3_uri = EXCLUDED.body_s3_uri,
                    body_inline = EXCLUDED.body_inline,
                    keywords = EXCLUDED.keywords,
                    bedrock_usage = EXCLUDED.bedrock_usage,
                    created_at = now()
                """,
                ldate=letter["letter_date"],
                eid=letter["editor_id"],
                grp=letter["mbti_group"],
                aid=letter["article_id"],
                sec=letter.get("secondary_article_ids") or [],
                mode=letter.get("mode") or "A",
                arch=letter.get("archetype"),
                theme=letter.get("theme"),
                head=letter["headline"],
                sub=letter.get("subtitle"),
                close=letter.get("closing_line"),
                s3=letter.get("body_s3_uri"),
                inline=json.dumps(
                    letter.get("body_inline") or {},
                    default=_json_default, ensure_ascii=False,
                ),
                kw=json.dumps(
                    letter.get("keywords") or [],
                    default=_json_default, ensure_ascii=False,
                ),
                usage=json.dumps(
                    letter.get("bedrock_usage") or {},
                    default=_json_default, ensure_ascii=False,
                ),
            )
        except Exception as exc:
            logger.error(
                f"insert_daily_letter({letter.get('letter_date')!r}, "
                f"{letter.get('editor_id')!r}) failed: {exc}",
                exc_info=True,
            )
            raise

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

    # ------------------------------------------------------------------
    # CMS posts 읽기 — 공개 API 전용 (CMS spec §5.1)
    # ------------------------------------------------------------------

    _CMS_COLUMNS = """id, slug, channels, publish_date, mbti_group, editor_id,
                      headline, subtitle, closing_line, body_inline,
                      cover_image_url, published_at"""

    def _cms_row(self, r) -> Dict[str, Any]:
        body = r[9]
        if isinstance(body, str):
            try:
                body = json.loads(body)
            except Exception:
                body = {}
        return {
            "id": str(r[0]),
            "slug": r[1],
            "channels": list(r[2] or []),
            "publish_date": r[3].isoformat() if hasattr(r[3], "isoformat") else r[3],
            "mbti_group": r[4],
            "editor_id": r[5],
            "headline": r[6],
            "subtitle": r[7],
            "closing_line": r[8],
            "body_inline": body or {},
            "cover_image_url": r[10] or "",
            "published_at": r[11].isoformat() if hasattr(r[11], "isoformat") else r[11],
        }

    def list_published_posts(
        self, channel: str, date: Optional[str], limit: int = 20
    ) -> List[Dict[str, Any]]:
        """발행된 CMS 글. 삭제분(deleted_at)과 초안은 제외한다."""
        if not self._enabled:
            return []
        sql = (
            f"SELECT {self._CMS_COLUMNS} FROM cms_posts "
            "WHERE status = 'published' AND deleted_at IS NULL "
            "AND :channel = ANY(channels)"
        )
        params: Dict[str, Any] = {"channel": channel, "limit": limit}
        if date:
            sql += " AND publish_date = CAST(:pdate AS date)"
            params["pdate"] = date
        sql += " ORDER BY publish_date DESC, published_at DESC LIMIT :limit"
        return [self._cms_row(r) for r in self.conn.run(sql, **params)]

    def get_published_post_by_slug(self, slug: str) -> Optional[Dict[str, Any]]:
        if not self._enabled:
            return None
        rows = self.conn.run(
            f"SELECT {self._CMS_COLUMNS} FROM cms_posts "
            "WHERE slug = :slug AND status = 'published' AND deleted_at IS NULL",
            slug=slug,
        )
        return self._cms_row(rows[0]) if rows else None

    def get_daily_letters(self, letter_date: str) -> List[Dict[str, Any]]:
        """Today Letters API 의 read 경로. 4 letter row 반환 (NT/NF/ST/SF)."""
        if not self._enabled:
            return []
        try:
            rows = self.conn.run(
                """
                SELECT id, letter_date, editor_id, mbti_group, article_id,
                       secondary_article_ids, mode, archetype, theme,
                       headline, subtitle, closing_line,
                       body_s3_uri, body_inline, keywords, created_at
                FROM daily_letters
                WHERE letter_date = :ldate
                  AND deleted_at IS NULL
                ORDER BY
                    CASE mbti_group
                        WHEN 'NT' THEN 1 WHEN 'NF' THEN 2
                        WHEN 'ST' THEN 3 WHEN 'SF' THEN 4
                    END
                """,
                ldate=letter_date,
            )
            results: List[Dict[str, Any]] = []
            for r in rows:
                results.append({
                    "id": str(r[0]),
                    "letter_date": r[1].isoformat() if r[1] else None,
                    "editor_id": r[2],
                    "mbti_group": r[3],
                    "article_id": r[4],
                    "secondary_article_ids": list(r[5] or []),
                    "mode": r[6],
                    "archetype": r[7],
                    "theme": r[8],
                    "headline": r[9],
                    "subtitle": r[10],
                    "closing_line": r[11],
                    "body_s3_uri": r[12],
                    "body_inline": r[13],
                    "keywords": r[14],
                    "created_at": r[15].isoformat() if r[15] else None,
                })
            return results
        except Exception as exc:
            logger.warning(f"get_daily_letters({letter_date!r}) failed: {exc}")
            return []
