"""Memory Manager — Phase 3 Core 3 personalization library.

A small wrapper around ``PgVectorV2Client`` and ``EmbeddingV2Client`` that
exposes the four memory layers (short-term, episodic, semantic,
procedural) plus a profile bootstrap helper. Pure library — never wired
into a Lambda handler directly. The Phase 3 handlers (Round 5-C
``core3_feed`` and ``core3_record_interaction``) consume this through
``ContextBroker``.

Memory layer ↔ data source mapping (decided in Round 5 planning, Q2)
-------------------------------------------------------------------
* **Short-term**: last 30 minutes of ``user_interactions``. Used by the
  Recommend Agent's "current session" signal — articles the user is
  actively reading right now should not reappear higher in the feed.
* **Episodic**: the last N (default 100) ``user_interactions`` rows.
  Used by Context Broker to derive ``recent_news_ids`` (deduped recency
  list) for Stage 1 candidate exclusion.
* **Semantic**: stable user facts from ``user_profiles`` — currently
  only ``mbti_type``. Cognito demographic fields could land here in a
  later phase but are not in scope.
* **Procedural**: learned preferences — ``category_weights`` JSONB and
  the 1024-dim ``preference_embedding``. Updated by Round 5-D
  consolidation Lambda; read here for the Recommend Agent.

Cold-start (Q3 = C, decided in Round 5 planning)
------------------------------------------------
``get_or_create_profile(user_id, mbti_type)`` is idempotent. On first
call for a user, it embeds a canonical Korean sentence describing the
MBTI group's preferences (see ``_MBTI_GROUP_SEEDS``) and writes it as
the seed ``preference_embedding``. On subsequent calls it returns the
existing profile unchanged — never re-seeds, never overwrites.

The transition from seed → learned embedding (EWMA over recent clicks)
happens in Round 5-D consolidation Lambda, not here. Users with <10
interactions continue using the seed.
"""
from __future__ import annotations

import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from v2.clients.pgvector_v2_client import PgVectorV2Client
from v2.clients.embedding_v2_client import EmbeddingV2Client


logger = logging.getLogger(__name__)


# ── Constants ────────────────────────────────────────────────────────────────

# Default short-term window. 30 min is generous for "current session" —
# typical mobile reading sessions are 5-15 min; the wider window catches
# users who pause mid-article (push notification, tab switch) and resume.
DEFAULT_SHORT_TERM_MINUTES = 30

# Default episodic depth. 100 events ≈ 1-2 weeks of typical engagement.
# Used by Context Broker to derive recent_news_ids; the deduped distinct
# news_id count is usually 30-60 from this many events.
DEFAULT_EPISODIC_LIMIT = 100

# 16-value MBTI whitelist — matches user_profiles.mbti_type CHECK.
_VALID_MBTI_FULL = frozenset({
    "INTJ", "INTP", "ENTJ", "ENTP",
    "INFJ", "INFP", "ENFJ", "ENFP",
    "ISTJ", "ISTP", "ESTJ", "ESTP",
    "ISFJ", "ISFP", "ESFJ", "ESFP",
})

# Seed sentences for cold-start preference_embedding (Q3 = C).
# 4-group keys (NT/NF/ST/SF) — derived from full mbti_type[1:3]. The
# group level is deliberate: article_versions are also at group level,
# so the seed embedding lives in the same conceptual space the
# Recommend Agent will compare against.
#
# Korean prose because the article corpus is Korean and Titan V2 produces
# language-aware embeddings. English seeds would land in a different
# region of the embedding space and bias the cold-start ranking.
_MBTI_GROUP_SEEDS: Dict[str, str] = {
    "NT": (
        "분석적이고 데이터 중심의 사고. 시스템 전체를 보는 논리적 통찰. "
        "객관적 사실, 통계, 시장 동향, 기술 트렌드, 거시경제 분석. "
        "효율과 합리성을 중시하며 새로운 아이디어와 미래 가능성에 관심."
    ),
    "NF": (
        "가치와 의미를 추구. 인간적 통찰과 사회적 비전. "
        "영감을 주는 이야기, 변화의 동력, 윤리와 철학, 인물의 신념. "
        "정성적 판단을 신뢰하며 따뜻한 관점으로 세상을 바라봄."
    ),
    "ST": (
        "검증된 절차와 안정성을 선호. 즉시 적용 가능한 실용적 정보. "
        "구체적 사실, 명확한 데이터, 안전 규제, 정책 시행, 실무 사례. "
        "체계적이고 신중한 접근, 책임감과 의무를 중요시."
    ),
    "SF": (
        "사람 중심의 따뜻한 이야기. 공감과 관계, 일상의 작은 변화. "
        "실제 경험, 사람들의 목소리, 지역 사회, 가족과 이웃. "
        "감정의 결을 읽고 의미 있는 순간을 소중히 여김."
    ),
}


# ── Helpers ──────────────────────────────────────────────────────────────────


def _validate_mbti_full(mbti_type: str) -> str:
    """Strict 16-value MBTI validator.

    Returns the normalized (uppercased, stripped) MBTI string. Raises
    ``ValueError`` on invalid input. Stricter than client-level
    ``_normalize_mbti_group`` because profile creation requires the
    full MBTI for storage in the CHAR(4) column.
    """
    if not isinstance(mbti_type, str):
        raise ValueError(f"mbti_type must be str, got {type(mbti_type).__name__}")
    cleaned = mbti_type.strip().upper()
    if cleaned not in _VALID_MBTI_FULL:
        raise ValueError(
            f"Invalid mbti_type: {mbti_type!r}. Must be one of "
            f"the 16 standard codes (e.g. INTJ, ENFP)."
        )
    return cleaned


def _mbti_group_from_full(mbti_full: str) -> str:
    """INTJ → NT, ENFP → NF, etc. Assumes ``_validate_mbti_full`` already ran."""
    return mbti_full[1:3]


# ── Consolidation helpers (Round 5-D) ────────────────────────────────────────


# Per-event weight contribution to category_weights summation.
# Keys are (interaction_type, dwell-bucket-or-rating-marker). The
# function below picks the right one — kept as code rather than a
# nested dict to keep edge cases (rating=None, dwell=None) explicit.

# Threshold above which a 'dwell' event counts as engaged reading
# rather than incidental. 5 seconds is a typical "started reading"
# threshold; below that it could be a misclick or a glance.
_DWELL_ENGAGED_MS = 5000


def _event_weight(
    interaction_type: str,
    dwell_ms: Optional[int],
    rating: Optional[int],
) -> float:
    """Compute the category_weights contribution for a single event.

    Mapping (Round 5-D Q6 = B):
      click           → +1.0
      dwell (>5000ms) → +2.0
      dwell (≤5000ms) → +1.0   # short dwell ~ click intensity
      react           → +3.0   # explicit positive signal
      rate (≥4)       → +3.0   # 4-5 stars
      rate (≤2)       → -1.0   # 1-2 stars
      rate (3)        →  0.0   # neutral
      scroll          → +1.0   # progressed somehow
      skip            → -1.0

    Unknown interaction_type returns 0 (defensive — schema CHECK
    prevents this but the function shouldn't crash on bad input).
    """
    if interaction_type == "click":
        return 1.0
    if interaction_type == "dwell":
        if dwell_ms is not None and dwell_ms > _DWELL_ENGAGED_MS:
            return 2.0
        return 1.0
    if interaction_type == "react":
        return 3.0
    if interaction_type == "rate":
        if rating is None:
            return 0.0
        if rating >= 4:
            return 3.0
        if rating <= 2:
            return -1.0
        return 0.0
    if interaction_type == "scroll":
        return 1.0
    if interaction_type == "skip":
        return -1.0
    return 0.0


def _normalize_category_weights(raw: Dict[str, float]) -> Dict[str, float]:
    """Convert raw per-category weight sums to a normalized [0, 1]
    distribution.

    Negative weights clamp to 0 (a category with skip-only signal
    contributes 0 to the user's positive preferences — RecommendAgent's
    Stage 2 ``_category_weight`` expects [0, 1]). Then divide by the
    total positive mass so the surviving weights sum to 1.

    All-negative or all-zero input → empty dict (caller leaves the
    user's existing category_weights alone, since "everything is
    noise" doesn't justify wiping prior signal).
    """
    clamped = {c: w for c, w in raw.items() if w > 0}
    total = sum(clamped.values())
    if total <= 0:
        return {}
    return {c: w / total for c, w in clamped.items()}


# ── Memory Manager ───────────────────────────────────────────────────────────


class MemoryManager:
    """Read-side facade over the four memory layers.

    Designed for dependency injection: tests pass fakes for
    ``pg_client`` and ``embedding_client``; production code default-
    constructs both from environment variables (matching the v2
    client convention).

    Round 5-A scope was read-only + ``get_or_create_profile``;
    Round 5-D added ``consolidate(user_id)`` and the supporting
    pgvector client methods (``find_active_users_since``,
    ``get_interaction_centroid_data``).
    """

    def __init__(
        self,
        pg_client: Optional[PgVectorV2Client] = None,
        embedding_client: Optional[EmbeddingV2Client] = None,
    ) -> None:
        self._pg = pg_client if pg_client is not None else PgVectorV2Client()
        if embedding_client is not None:
            self._embed = embedding_client
        else:
            # VPC-routed Bedrock requires explicit endpoint_url. Default
            # boto3 fallback resolves the public hostname which has no
            # route from inside this VPC (Private DNS disabled at the
            # interface endpoint per CLAUDE.md). Mirroring the
            # core1_collector pattern keeps every Bedrock consumer
            # consistent — and prevents this default constructor from
            # silently hanging in production for future callers
            # (Round 5-D consolidation, etc.).
            self._embed = EmbeddingV2Client(
                endpoint_url=os.getenv("BEDROCK_RUNTIME_ENDPOINT_URL", "")
            )

    # ---- Short-term -----------------------------------------------------------

    def get_short_term(
        self,
        user_id: str,
        window_minutes: int = DEFAULT_SHORT_TERM_MINUTES,
    ) -> List[Dict[str, Any]]:
        """Interactions from the last ``window_minutes``, newest-first.

        Pgvector-only implementation (Q2). The ``idx_user_interactions
        _user_created`` index makes the time-windowed read cheap even
        on large tables.
        """
        since = datetime.now(timezone.utc) - timedelta(minutes=window_minutes)
        # Generous limit — short-term windows are small in practice
        # (≤ a few hundred events even for power users), so the
        # 200-row cap is just a safety rail.
        return self._pg.get_user_interactions(user_id, limit=200, since=since)

    # ---- Episodic -------------------------------------------------------------

    def get_episodic(
        self,
        user_id: str,
        limit: int = DEFAULT_EPISODIC_LIMIT,
    ) -> List[Dict[str, Any]]:
        """Last ``limit`` interactions, all-time, newest-first.

        Pattern-detection layer. Used by Context Broker's
        ``recent_news_ids`` derivation and by Round 5-D consolidation
        when computing fresh ``category_weights``.
        """
        return self._pg.get_user_interactions(user_id, limit=limit)

    # ---- Semantic -------------------------------------------------------------

    def get_semantic(self, user_id: str) -> Optional[Dict[str, Any]]:
        """Stable facts from the user profile, or ``None`` if no profile.

        Currently exposes only ``mbti_type``. The dict shape leaves
        room for Cognito-derived fields (display_name, locale) in a
        later phase without breaking callers.
        """
        profile = self._pg.get_user_profile(user_id)
        if profile is None:
            return None
        return {"mbti_type": profile.get("mbti_type")}

    # ---- Procedural -----------------------------------------------------------

    def get_procedural(self, user_id: str) -> Optional[Dict[str, Any]]:
        """Learned preferences (weights + embedding), or ``None`` if no profile.

        Two reads (profile metadata + embedding) because the v2 client
        keeps the embedding off the standard profile read path. For
        cold-start users, ``preference_embedding`` may be ``None`` —
        callers must handle that (Recommend Agent falls back to
        recency-based ranking when missing).
        """
        profile = self._pg.get_user_profile(user_id)
        if profile is None:
            return None
        embedding = self._pg.get_preference_embedding(user_id)
        return {
            "category_weights": profile.get("category_weights") or {},
            "preference_embedding": embedding,
        }

    # ---- Profile bootstrap ---------------------------------------------------

    def get_or_create_profile(
        self,
        user_id: str,
        mbti_type: str,
    ) -> Dict[str, Any]:
        """Idempotent profile creation with MBTI-seeded ``preference_embedding``.

        Call site (Round 5-C handlers): on every authenticated request,
        before reading the profile. Cheap when profile exists (1 SELECT,
        no Bedrock call). Expensive only on first-time creation
        (1 SELECT + 1 Titan embed + 1 INSERT).

        Returns the profile dict (same shape as
        ``PgVectorV2Client.get_user_profile``). The returned dict does
        NOT include the seed embedding — callers needing the vector
        use ``get_procedural`` separately. This keeps the bootstrap
        return value small.

        Raises
        ------
        ValueError
            If ``mbti_type`` is not one of the 16 standard codes. Caller
            (handler) should catch and return HTTP 400.
        """
        # Validate FIRST — never embed or upsert with bad MBTI.
        normalized_mbti = _validate_mbti_full(mbti_type)

        # Fast path: existing profile.
        existing = self._pg.get_user_profile(user_id)
        if existing is not None:
            logger.debug(
                f"get_or_create_profile({user_id!r}): existing profile, "
                f"returning unchanged"
            )
            return existing

        # Cold start: embed seed sentence for the user's MBTI group.
        group = _mbti_group_from_full(normalized_mbti)
        seed_text = _MBTI_GROUP_SEEDS[group]
        logger.info(
            f"get_or_create_profile({user_id!r}): cold-start, seeding "
            f"with {group} canonical embedding"
        )
        seed_embedding = self._embed.embed_text(seed_text)

        # Upsert with seed. category_weights starts empty — populated
        # by Round 5-D consolidation as interactions accumulate.
        self._pg.upsert_user_profile(
            user_id=user_id,
            mbti_type=normalized_mbti,
            category_weights={},
            preference_embedding=seed_embedding,
        )

        # Re-read to get canonical row (with timestamps from server).
        # If the read fails (transient DB issue post-write), return a
        # synthesized dict matching the shape — caller doesn't need to
        # know the read failed since the write succeeded.
        created = self._pg.get_user_profile(user_id)
        if created is not None:
            return created
        return {
            "user_id": user_id,
            "mbti_type": normalized_mbti,
            "category_weights": {},
            "created_at": None,
            "updated_at": None,
        }

    # ---- Consolidation (Round 5-D) -------------------------------------------

    # Threshold for switching from seed embedding to learned EWMA
    # embedding. Until the user has at least this many distinct
    # articles touched in the consolidation window, the seed stays.
    # 10 chosen as a small-but-nonzero floor — fewer than 10 distinct
    # articles makes the centroid noisy.
    _CONSOLIDATE_THRESHOLD = 10

    # EWMA smoothing factor (Q5 = B in Round 5-D planning).
    # new_emb = α × interaction_centroid + (1 - α) × old_emb
    # 0.2 means the seed's influence halves every ~3 consolidations
    # (3 days for a daily-batch user); a steady user converges to
    # interaction-driven preference within ~2 weeks.
    _EWMA_ALPHA = 0.2

    # Lookback window. Matches Round 5-D Q2 = B (30 days).
    _CONSOLIDATE_WINDOW_DAYS = 30

    def consolidate(
        self,
        user_id: str,
        now: Optional[datetime] = None,
    ) -> Dict[str, Any]:
        """Recompute ``preference_embedding`` (EWMA) and
        ``category_weights`` (interaction-weighted normalized) for a
        single user.

        Idempotent over the 30-day window: re-running with the same
        ``now`` produces the same result because the input set is
        windowed and EWMA is applied to whatever ``preference_embedding``
        currently sits in the row (which itself was computed by the
        previous run on the same windowed input + the run before that's
        embedding, ad infinitum). The recursion converges as the seed's
        weight (1-α)^n decays toward zero.

        Returns a status dict for the caller (the consolidation Lambda)
        to aggregate into per-fire metrics::

            {
                "user_id": ...,
                "status": "applied" | "skipped_below_threshold" |
                          "skipped_no_profile" | "skipped_no_centroid",
                "distinct_news_count": <int>,
                "category_weights_count": <int>,  # post-normalization
            }

        Statuses:
          * applied — EWMA + category_weights written.
          * skipped_below_threshold — fewer than 10 distinct articles
            touched in window; profile unchanged. Most cold-start users
            remain here for the first ~week.
          * skipped_no_profile — user has interactions but no profile
            row (can happen if record_interaction was called before
            any 4-char-MBTI request). consolidate doesn't synthesize a
            profile out of thin air; that's get_or_create_profile's
            job, requiring the user's MBTI which interactions don't
            necessarily carry.
          * skipped_no_centroid — articles touched but all their
            embeddings are NULL (extreme edge — would mean Collector
            wrote articles without embeddings, schema-impossible
            normally). Defensive.
        """
        if now is None:
            now = datetime.now(timezone.utc)
        cutoff = now - timedelta(days=self._CONSOLIDATE_WINDOW_DAYS)

        profile = self._pg.get_user_profile(user_id)
        if profile is None:
            return {
                "user_id": user_id,
                "status": "skipped_no_profile",
                "distinct_news_count": 0,
                "category_weights_count": 0,
            }

        agg = self._pg.get_interaction_centroid_data(user_id, cutoff)
        distinct = agg["distinct_news_count"]

        if distinct < self._CONSOLIDATE_THRESHOLD:
            return {
                "user_id": user_id,
                "status": "skipped_below_threshold",
                "distinct_news_count": distinct,
                "category_weights_count": 0,
            }

        if agg["centroid_embedding"] is None:
            return {
                "user_id": user_id,
                "status": "skipped_no_centroid",
                "distinct_news_count": distinct,
                "category_weights_count": 0,
            }

        # EWMA. old embedding may be None (very early user, profile
        # exists but seed somehow missed) — in that case use centroid
        # outright (skip the (1-α)×0 term).
        old_emb = self._pg.get_preference_embedding(user_id)
        new_emb = self._ewma(old_emb, agg["centroid_embedding"])

        # Category weights from event-stream
        raw: Dict[str, float] = {}
        for ev in agg["events"]:
            cat = ev.get("category")
            if not cat:
                continue
            w = _event_weight(
                ev["interaction_type"],
                ev.get("dwell_ms"),
                ev.get("rating"),
            )
            raw[cat] = raw.get(cat, 0.0) + w
        normalized = _normalize_category_weights(raw)

        # Persist via existing upsert. mbti_type is preserved from the
        # current profile (consolidate never changes MBTI).
        self._pg.upsert_user_profile(
            user_id=user_id,
            mbti_type=profile.get("mbti_type"),
            category_weights=normalized,
            preference_embedding=new_emb,
        )

        logger.info(
            f"consolidate({user_id!r}): applied — "
            f"distinct={distinct} categories={len(normalized)}"
        )
        return {
            "user_id": user_id,
            "status": "applied",
            "distinct_news_count": distinct,
            "category_weights_count": len(normalized),
        }

    @classmethod
    def _ewma(
        cls,
        old: Optional[List[float]],
        centroid: List[float],
    ) -> List[float]:
        """Element-wise EWMA. Fallback to centroid when old is missing
        or dimension-mismatched."""
        if old is None or len(old) != len(centroid):
            return list(centroid)
        a = cls._EWMA_ALPHA
        return [a * c + (1.0 - a) * o for o, c in zip(old, centroid)]
