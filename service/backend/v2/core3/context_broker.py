"""Context Broker — Phase 3 Core 3 personalization library.

Assembles a per-request ``UserContext`` from the four memory layers
that ``MemoryManager`` exposes. Lives between the Lambda handlers and
the Recommend Agent (Round 5-B): handlers receive a ``user_id`` and a
``request_type``, ask the broker for context, and pass the resulting
dataclass into the Recommend Agent.

Round 5-A scope: ``request_type='feed'`` only. Other request types
(chat, search, podcast) are placeholders in the signature with
``NotImplementedError`` at call time. Each will be implemented in the
round that adds the consuming handler:

* ``'chat'``    — Phase 4 Chat Agent (AgentCore Runtime)
* ``'search'``  — Phase 5 (out of v2 scope for now)
* ``'podcast''  — paired with the podcast handler when revived

Why a dataclass and not a dict
------------------------------
The Recommend Agent reads 6 distinct fields off this object on every
feed request. A dataclass enforces the schema at construction time
(missing fields = TypeError) and gives downstream type checkers
something to verify. The runtime cost vs a dict is negligible.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from v2.core3.memory_manager import MemoryManager


logger = logging.getLogger(__name__)


# ── Constants ────────────────────────────────────────────────────────────────

# How many recent episodes to scan when deriving ``recent_news_ids``.
# 30 is enough for the typical exclusion window (last week of clicks)
# without dragging in stale interactions that no longer represent
# current interest.
_RECENT_EPISODIC_LIMIT = 30

# Supported request types in this round. Unsupported types raise
# NotImplementedError at runtime — keeps the API surface stable while
# new request types are still on the roadmap.
_SUPPORTED_REQUEST_TYPES = frozenset({"feed"})


# ── Data shape ───────────────────────────────────────────────────────────────


@dataclass
class UserContext:
    """Layered context object for a personalization request.

    All fields are populated synchronously by ``ContextBroker.
    get_user_context``. ``has_profile`` is the canonical "is this user
    cold or warm" signal — Recommend Agent uses it to decide between
    Phase 2.5 selection-based feed (cold path) and the
    ``find_feed_candidates`` path (warm path), per the Q1 = C
    hybrid decision.

    Fields
    ------
    user_id
        Pass-through from the request. Always present.
    mbti_type
        4-char code from the profile (e.g. ``'INTJ'``). ``None`` for
        cold-start users (no profile row yet).
    mbti_group
        2-char derivative (``'NT'`` etc.). ``None`` mirrors
        ``mbti_type``. Provided as a separate field because
        article_versions and ranking queries operate at group level.
    category_weights
        Learned per-category preference weights from
        ``user_profiles.category_weights``. Empty dict for cold-start.
    preference_embedding
        1024-dim vector for kNN candidate retrieval. ``None`` for
        cold-start (until ``get_or_create_profile`` runs) and for
        legacy rows without an embedding.
    recent_news_ids
        Deduped news_ids the user touched recently, newest-first. Used
        as ``exclude_news_ids`` in
        ``PgVectorV2Client.find_feed_candidates``.
    has_profile
        True iff ``user_profiles`` has a row for this user. Convenience
        flag — equivalent to ``mbti_type is not None`` in Round 5-A
        (every profile row stores a non-null mbti_type), but kept
        explicit so future schemas with optional MBTI don't silently
        flip the meaning.
    """

    user_id: str
    mbti_type: Optional[str]
    mbti_group: Optional[str]
    category_weights: Dict[str, float]
    preference_embedding: Optional[List[float]]
    recent_news_ids: List[str] = field(default_factory=list)
    has_profile: bool = False


# ── Broker ───────────────────────────────────────────────────────────────────


class ContextBroker:
    """Layered context assembler.

    Holds a reference to ``MemoryManager`` and orchestrates per-request-
    type assembly. Stateless beyond the cached ``MemoryManager`` (which
    in turn caches DB connections).
    """

    def __init__(self, memory_manager: Optional[MemoryManager] = None) -> None:
        self._mem = (
            memory_manager if memory_manager is not None else MemoryManager()
        )

    def get_user_context(
        self,
        user_id: str,
        request_type: str = "feed",
    ) -> UserContext:
        """Assemble context for a feed request.

        Layer use for ``request_type='feed'``:
          * semantic    → mbti_type / mbti_group
          * procedural  → category_weights, preference_embedding
          * episodic    → recent_news_ids (deduped, recency-ordered)

        Short-term is intentionally NOT included in the feed context.
        It will join later via the Round 5-C event handler's "current
        session deboost" — Recommend Agent recomputes the exclusion
        list at request time using the most recent N seconds of clicks
        rather than a layer baked into UserContext.
        """
        if request_type not in _SUPPORTED_REQUEST_TYPES:
            raise NotImplementedError(
                f"request_type={request_type!r} not supported in Round 5-A. "
                f"Supported: {sorted(_SUPPORTED_REQUEST_TYPES)}. "
                f"chat/search/podcast types arrive in later rounds."
            )

        # ── Semantic + procedural reads ─────────────────────────────────
        semantic = self._mem.get_semantic(user_id)
        procedural = self._mem.get_procedural(user_id)
        has_profile = semantic is not None

        mbti_full: Optional[str] = None
        mbti_group: Optional[str] = None
        if semantic and semantic.get("mbti_type"):
            mbti_full = semantic["mbti_type"]
            if isinstance(mbti_full, str) and len(mbti_full) == 4:
                mbti_group = mbti_full[1:3]

        category_weights: Dict[str, float] = {}
        preference_embedding: Optional[List[float]] = None
        if procedural is not None:
            # category_weights is always a dict (defaults {} from Memory
            # Manager). preference_embedding may be None for cold-start.
            category_weights = procedural.get("category_weights") or {}
            preference_embedding = procedural.get("preference_embedding")

        # ── Episodic → recent_news_ids ────────────────────────────────
        episodic = self._mem.get_episodic(
            user_id, limit=_RECENT_EPISODIC_LIMIT
        )
        recent_news_ids = self._dedupe_news_ids(episodic)

        return UserContext(
            user_id=user_id,
            mbti_type=mbti_full,
            mbti_group=mbti_group,
            category_weights=category_weights,
            preference_embedding=preference_embedding,
            recent_news_ids=recent_news_ids,
            has_profile=has_profile,
        )

    @staticmethod
    def _dedupe_news_ids(episodic: List[Dict[str, Any]]) -> List[str]:
        """Extract ordered, deduped news_ids from episodic events.

        ``episodic`` is newest-first (per ``get_user_interactions``
        ORDER BY ``created_at DESC``). We preserve that order so the
        first occurrence of each news_id wins — exactly what we want
        for a recency-biased exclusion list.

        Skips events with falsy news_id (defensive — schema enforces
        NOT NULL but interactions inserted before a column rename
        could be defective).
        """
        seen: set = set()
        ordered: List[str] = []
        for evt in episodic:
            nid = evt.get("news_id")
            if not nid:
                continue
            if nid in seen:
                continue
            seen.add(nid)
            ordered.append(nid)
        return ordered
