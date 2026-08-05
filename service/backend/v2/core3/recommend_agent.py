"""Recommend Agent — Phase 3 Core 3 personalization library.

3-Stage ranking pipeline for the warm path (users with a learned
preference embedding); cold-path passthrough for users without.
Stateless beyond the cached pgvector client connection.

Stages
------
1. Candidate retrieval (~100 article versions via
   ``PgVectorV2Client.find_feed_candidates``, kNN-ordered by the
   user's ``preference_embedding``).
2. Personal scoring — composite weighted sum:
       0.5 × cosine_sim(preference, version)
     + 0.3 × category_weight(category, user.category_weights)
     + 0.2 × recency_score(published_at, halflife=7d)
3. Diversity rerank — MMR (Maximal Marginal Relevance) plus a per-
   category cap (default 40% of final list).

Engagement term deferred (Round 5-D)
------------------------------------
TASKS.md TASK-3.3 lists a 4th scoring term: ``engagement_score_avg_
from_similar_users``. Computing it requires either a similar-user
join (no v2 schema for that) or per-article engagement aggregates
(not yet computed). The Round 5-D consolidation Lambda is the
natural place to compute these aggregates; until then, the agent
uses a 3-term composite. Re-enabling the 4th term later is non-
breaking — add ``W_ENGAGEMENT`` and renormalize.

Cold path (Q1 = C hybrid)
-------------------------
When ``ctx.has_profile is False`` OR ``ctx.preference_embedding is
None``, the agent calls ``PgVectorV2Client.get_feed`` (Phase 2.5
selection feed) and returns rows wrapped in ``RankedArticle`` with
``path='cold'`` so Round 5-C handlers can adapt the differing payload
shapes (cold rows have richer ``article_metadata`` / ``version_metadata``
via the article_selections JOIN).
"""
from __future__ import annotations

import logging
import math
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from v2.clients.pgvector_v2_client import PgVectorV2Client
from v2.core3.context_broker import UserContext


logger = logging.getLogger(__name__)


# ── Tuning constants ─────────────────────────────────────────────────────────

# Stage 1
DEFAULT_CANDIDATE_LIMIT = 100

# Stage 2 — composite scoring weights (sum = 1.0)
W_COSINE = 0.5
W_CATEGORY = 0.3
W_RECENCY = 0.2

# Stage 2 — recency exponential decay halflife
RECENCY_HALFLIFE_DAYS = 7.0

# Stage 3
DEFAULT_FINAL_LIMIT = 20
DEFAULT_MMR_LAMBDA = 0.7         # higher = more relevance, less diversity
DEFAULT_CATEGORY_CAP_RATIO = 0.4 # max fraction of final list per category

# Neutral fallback for missing/null fields. Uniform 0.5 across all
# candidates contributes a constant ``W_X * 0.5`` to every score —
# no-op for ranking purposes (constants cancel in argsort).
_NEUTRAL_SCORE = 0.5


# ── Pure helpers ─────────────────────────────────────────────────────────────


def _cosine_from_distance(distance: Optional[float]) -> float:
    """pgvector cosine distance ∈ [0, 2] → similarity ∈ [0, 1].

    With Titan V2 (normalize=True) yielding unit vectors, cosine
    similarity = 1 - cosine distance. ``None`` → neutral 0.5.
    Distances > 1 (theoretically possible for anti-parallel inputs)
    clamp to similarity 0.
    """
    if distance is None:
        return _NEUTRAL_SCORE
    sim = 1.0 - distance
    if sim < 0.0:
        return 0.0
    if sim > 1.0:
        return 1.0
    return sim


def _category_weight(
    category: Optional[str],
    weights: Dict[str, float],
) -> float:
    """Look up category weight in [0,1]; default 0.5 (neutral) for unknowns.

    Empty ``weights`` (cold-start, before consolidation has run) makes
    every candidate get 0.5 here — uniform contribution = no ranking
    effect, so cold-start scoring effectively reduces to cosine + recency.
    """
    if not category:
        return _NEUTRAL_SCORE
    val = weights.get(category)
    if val is None:
        return _NEUTRAL_SCORE
    try:
        f = float(val)
    except (TypeError, ValueError):
        return _NEUTRAL_SCORE
    if f < 0.0:
        return 0.0
    if f > 1.0:
        return 1.0
    return f


def _recency_score(
    published_at: Optional[datetime],
    now: Optional[datetime] = None,
) -> float:
    """Exponential decay: halflife = ``RECENCY_HALFLIFE_DAYS``.

    Today → 1.0. 7 days old → 0.5. 14 days → 0.25. Future-dated
    (clock skew, embargo) → 1.0. ``None`` → neutral 0.5. Naive
    datetimes (defensive — schema is TIMESTAMPTZ) treated as UTC.
    """
    if published_at is None:
        return _NEUTRAL_SCORE
    if now is None:
        now = datetime.now(timezone.utc)
    pa = published_at
    if pa.tzinfo is None:
        pa = pa.replace(tzinfo=timezone.utc)
    age_days = (now - pa).total_seconds() / 86400.0
    if age_days <= 0:
        return 1.0
    return math.exp(-math.log(2) * age_days / RECENCY_HALFLIFE_DAYS)


def _composite_score(
    candidate: Dict[str, Any],
    category_weights: Dict[str, float],
    now: Optional[datetime] = None,
) -> Dict[str, float]:
    """Compute all components AND the composite. Returned as dict so
    tests and debug logging can inspect each term."""
    cos = _cosine_from_distance(candidate.get("distance"))
    cat = _category_weight(candidate.get("category"), category_weights)
    rec = _recency_score(candidate.get("published_at"), now)
    composite = W_COSINE * cos + W_CATEGORY * cat + W_RECENCY * rec
    return {
        "cosine": cos,
        "category": cat,
        "recency": rec,
        "composite": composite,
    }


def _embedding_cosine(a: List[float], b: List[float]) -> float:
    """Pure cosine similarity. Returns 0.0 for any zero/empty/mismatched."""
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = 0.0
    na = 0.0
    nb = 0.0
    for x, y in zip(a, b):
        dot += x * y
        na += x * x
        nb += y * y
    if na == 0.0 or nb == 0.0:
        return 0.0
    return dot / (math.sqrt(na) * math.sqrt(nb))


# ── Output shape ─────────────────────────────────────────────────────────────


@dataclass
class RankedArticle:
    """Wraps a candidate with score, breakdown, and provenance.

    ``payload`` shape varies by ``path``:
      * ``'warm'`` — ``find_feed_candidates`` row (with
                     article_metadata + version_metadata, but no
                     selection_date / transformed_at — the personalized
                     pick wasn't part of today's Phase 2.5 selection)
      * ``'cold'`` — ``get_feed`` row (full Phase 2.5 selection
                     metadata via the article_selections JOIN)

    Round 5-C handlers will normalize at the API boundary; this
    library doesn't try to unify the two shapes (premature coupling).
    """

    news_id: str
    mbti_type: str
    score: float
    payload: Dict[str, Any]
    path: str  # 'warm' | 'cold'
    score_breakdown: Optional[Dict[str, float]] = None


# ── Recommend Agent ──────────────────────────────────────────────────────────


class RecommendAgent:
    """3-Stage ranking pipeline. Stateless. Per-instance config (lambda,
    cap ratio) so handlers can pass overrides for A/B testing."""

    def __init__(
        self,
        pg_client: Optional[PgVectorV2Client] = None,
        mmr_lambda: float = DEFAULT_MMR_LAMBDA,
        category_cap_ratio: float = DEFAULT_CATEGORY_CAP_RATIO,
    ) -> None:
        if not (0.0 <= mmr_lambda <= 1.0):
            raise ValueError(
                f"mmr_lambda must be in [0, 1], got {mmr_lambda!r}"
            )
        if not (0.0 < category_cap_ratio <= 1.0):
            raise ValueError(
                f"category_cap_ratio must be in (0, 1], got {category_cap_ratio!r}"
            )
        self._pg = pg_client if pg_client is not None else PgVectorV2Client()
        self._mmr_lambda = mmr_lambda
        self._category_cap_ratio = category_cap_ratio

    # ---- Public entry point --------------------------------------------------

    def recommend(
        self,
        ctx: UserContext,
        limit: int = DEFAULT_FINAL_LIMIT,
        candidate_limit: int = DEFAULT_CANDIDATE_LIMIT,
    ) -> List[RankedArticle]:
        """Top-``limit`` ranked articles for this user's context.

        Routing (Q1 = C hybrid):
          * ``has_profile=False`` OR ``preference_embedding is None`` → cold
          * otherwise → warm (Stage 1-2-3)

        ``mbti_group`` missing → empty list (handler should 400 the
        request rather than receive a confusing empty feed).
        """
        if not ctx.mbti_group:
            logger.info("recommend(): mbti_group missing, returning empty")
            return []

        if not ctx.has_profile or ctx.preference_embedding is None:
            return self._cold_path(ctx, limit)
        return self._warm_path(ctx, limit, candidate_limit)

    # ---- Cold path -----------------------------------------------------------

    def _cold_path(
        self,
        ctx: UserContext,
        limit: int,
    ) -> List[RankedArticle]:
        """Phase 2.5 selection feed unchanged.

        ``get_feed`` already returns rows in (selection_date DESC,
        composite_score DESC) order — sane ranking for the cold case.
        Wrap in RankedArticle for shape consistency.
        """
        rows = self._pg.get_feed(ctx.mbti_group, limit=limit)
        return [
            RankedArticle(
                news_id=r["news_id"],
                mbti_type=r.get("mbti_type") or ctx.mbti_group,
                score=0.0,  # cold path doesn't compute personal score
                payload=r,
                path="cold",
            )
            for r in rows
        ]

    # ---- Warm path -----------------------------------------------------------

    def _warm_path(
        self,
        ctx: UserContext,
        limit: int,
        candidate_limit: int,
    ) -> List[RankedArticle]:
        # Stage 1 — candidate retrieval
        candidates = self._pg.find_feed_candidates(
            user_mbti=ctx.mbti_group,
            preference_embedding=ctx.preference_embedding,
            exclude_news_ids=ctx.recent_news_ids,
            limit=candidate_limit,
        )
        if not candidates:
            return []

        # Stage 2 — personal scoring (sorted desc by composite)
        scored = self._score_candidates(candidates, ctx.category_weights)

        # Stage 3 — MMR + category cap
        return self._diversify(scored, limit, ctx.mbti_group)

    def _score_candidates(
        self,
        candidates: List[Dict[str, Any]],
        category_weights: Dict[str, float],
    ) -> List[RankedArticle]:
        now = datetime.now(timezone.utc)
        scored: List[RankedArticle] = []
        for c in candidates:
            breakdown = _composite_score(c, category_weights, now)
            scored.append(RankedArticle(
                news_id=c["news_id"],
                mbti_type=c.get("mbti_type") or "",
                score=breakdown["composite"],
                payload=c,
                path="warm",
                score_breakdown=breakdown,
            ))
        scored.sort(key=lambda r: r.score, reverse=True)
        return scored

    def _diversify(
        self,
        scored: List[RankedArticle],
        limit: int,
        mbti_group: str,
    ) -> List[RankedArticle]:
        """MMR + category cap.

        MMR formula at each iteration:
            mmr(c) = λ × score(c) - (1-λ) × max_sim(c, already_selected)

        Pick the candidate with highest MMR subject to the category cap.
        If the cap blocks all remaining candidates before reaching
        ``limit``, top-up by raw score (cap lifted) so the caller still
        gets ``limit`` items rather than under-fill.
        """
        if not scored:
            return []

        # Fetch embeddings once for all candidates (Stage 3 setup).
        # Missing entries (no embedding for that news_id) treated as
        # "no diversity penalty applies to/from this candidate".
        news_ids = [r.news_id for r in scored]
        embeddings = self._pg.get_version_embeddings(news_ids, mbti_group)

        cap_per_category = max(1, math.ceil(limit * self._category_cap_ratio))
        cat_counts: Dict[str, int] = {}
        selected: List[RankedArticle] = []
        remaining: List[RankedArticle] = list(scored)

        # MMR loop with category cap
        while remaining and len(selected) < limit:
            best_idx = -1
            best_mmr = -math.inf
            for i, cand in enumerate(remaining):
                cat = cand.payload.get("category") or "_unknown"
                if cat_counts.get(cat, 0) >= cap_per_category:
                    continue

                cand_emb = embeddings.get(cand.news_id)
                if not selected:
                    mmr = cand.score
                elif cand_emb:
                    sims = [
                        _embedding_cosine(cand_emb, embeddings[s.news_id])
                        for s in selected
                        if s.news_id in embeddings
                    ]
                    max_sim = max(sims) if sims else 0.0
                    mmr = (
                        self._mmr_lambda * cand.score
                        - (1.0 - self._mmr_lambda) * max_sim
                    )
                else:
                    # No embedding for candidate — cannot compute
                    # diversity penalty. Use raw score with the lambda
                    # damping so it doesn't game by missing data.
                    mmr = self._mmr_lambda * cand.score

                if mmr > best_mmr:
                    best_mmr = mmr
                    best_idx = i

            if best_idx == -1:
                # All remaining candidates over the category cap.
                # Exit MMR loop and let the top-up below fill remaining
                # slots from highest-score leftovers (cap-free).
                break

            picked = remaining.pop(best_idx)
            selected.append(picked)
            cat = picked.payload.get("category") or "_unknown"
            cat_counts[cat] = cat_counts.get(cat, 0) + 1

        # Top-up if cap exhausted before reaching limit
        if len(selected) < limit and remaining:
            # remaining is still in score-desc order from _score_candidates
            for cand in remaining:
                selected.append(cand)
                if len(selected) >= limit:
                    break

        return selected
