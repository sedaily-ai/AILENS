"""Tests for RecommendAgent — TASK-3.3.

Layered:
  * Pure helper functions — full unit coverage with deterministic inputs.
  * Agent class with fakes — routing, scoring, MMR, category cap.
  * Integration — DoD requirement (10 users → different feeds), live PG.

Test row prefix: ``test_v2_3_3_`` (registered in conftest).
"""
from __future__ import annotations

import math
import os
import random
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

import pytest

from v2.core3.context_broker import UserContext
from v2.core3.recommend_agent import (
    DEFAULT_CANDIDATE_LIMIT,
    DEFAULT_CATEGORY_CAP_RATIO,
    DEFAULT_FINAL_LIMIT,
    DEFAULT_MMR_LAMBDA,
    RECENCY_HALFLIFE_DAYS,
    W_CATEGORY,
    W_COSINE,
    W_RECENCY,
    RankedArticle,
    RecommendAgent,
    _category_weight,
    _composite_score,
    _cosine_from_distance,
    _embedding_cosine,
    _recency_score,
)


# ── Pure helpers ─────────────────────────────────────────────────────────────


class TestCosineFromDistance:
    def test_none_yields_neutral(self):
        assert _cosine_from_distance(None) == 0.5

    def test_zero_distance_yields_full_similarity(self):
        assert _cosine_from_distance(0.0) == 1.0

    def test_unit_distance_yields_zero(self):
        assert _cosine_from_distance(1.0) == 0.0

    def test_clamps_above_one(self):
        # cosine distance can be > 1 (anti-parallel = 2)
        assert _cosine_from_distance(2.0) == 0.0

    def test_intermediate(self):
        assert _cosine_from_distance(0.3) == pytest.approx(0.7)


class TestCategoryWeight:
    def test_none_category_neutral(self):
        assert _category_weight(None, {"economy": 0.9}) == 0.5

    def test_empty_category_string_neutral(self):
        assert _category_weight("", {"economy": 0.9}) == 0.5

    def test_missing_key_neutral(self):
        assert _category_weight("tech", {"economy": 0.9}) == 0.5

    def test_returns_present_value(self):
        assert _category_weight("economy", {"economy": 0.9}) == 0.9

    def test_clamps_negative(self):
        assert _category_weight("k", {"k": -0.2}) == 0.0

    def test_clamps_above_one(self):
        assert _category_weight("k", {"k": 1.5}) == 1.0

    def test_invalid_value_neutral(self):
        assert _category_weight("k", {"k": "not a number"}) == 0.5


class TestRecencyScore:
    def test_none_neutral(self):
        assert _recency_score(None) == 0.5

    def test_today_full(self):
        now = datetime.now(timezone.utc)
        assert _recency_score(now, now) == pytest.approx(1.0)

    def test_one_halflife_yields_half(self):
        now = datetime(2024, 1, 8, tzinfo=timezone.utc)
        published = now - timedelta(days=RECENCY_HALFLIFE_DAYS)
        assert _recency_score(published, now) == pytest.approx(0.5)

    def test_two_halflives_yields_quarter(self):
        now = datetime(2024, 1, 15, tzinfo=timezone.utc)
        published = now - timedelta(days=2 * RECENCY_HALFLIFE_DAYS)
        assert _recency_score(published, now) == pytest.approx(0.25)

    def test_future_treated_as_fresh(self):
        now = datetime.now(timezone.utc)
        future = now + timedelta(days=1)
        assert _recency_score(future, now) == 1.0

    def test_naive_datetime_treated_as_utc(self):
        now = datetime(2024, 6, 1, 12, tzinfo=timezone.utc)
        published = datetime(2024, 6, 1, 12)  # naive, same wall clock
        assert _recency_score(published, now) == pytest.approx(1.0)


class TestEmbeddingCosine:
    def test_parallel_vectors_one(self):
        a = [1.0, 2.0, 3.0]
        b = [2.0, 4.0, 6.0]
        assert _embedding_cosine(a, b) == pytest.approx(1.0)

    def test_anti_parallel_neg_one(self):
        a = [1.0, 2.0, 3.0]
        b = [-1.0, -2.0, -3.0]
        assert _embedding_cosine(a, b) == pytest.approx(-1.0)

    def test_orthogonal_zero(self):
        a = [1.0, 0.0]
        b = [0.0, 1.0]
        assert _embedding_cosine(a, b) == pytest.approx(0.0)

    def test_zero_vector_zero(self):
        assert _embedding_cosine([0.0, 0.0], [1.0, 1.0]) == 0.0

    def test_mismatched_length_zero(self):
        assert _embedding_cosine([1.0], [1.0, 2.0]) == 0.0

    def test_empty_vectors_zero(self):
        assert _embedding_cosine([], []) == 0.0
        assert _embedding_cosine([], [1.0]) == 0.0


class TestCompositeScore:
    def test_all_neutrals_yields_half(self):
        breakdown = _composite_score(
            {"distance": None, "category": None, "published_at": None}, {}
        )
        # 0.5 × 0.5 + 0.3 × 0.5 + 0.2 × 0.5 = 0.5
        assert breakdown["composite"] == pytest.approx(0.5)

    def test_full_signals_max(self):
        now = datetime.now(timezone.utc)
        breakdown = _composite_score(
            {
                "distance": 0.0,         # cosine 1.0
                "category": "economy",   # weight 1.0
                "published_at": now,     # recency 1.0
            },
            {"economy": 1.0},
            now=now,
        )
        assert breakdown["composite"] == pytest.approx(1.0)

    def test_returns_all_four_keys(self):
        b = _composite_score(
            {"distance": 0.5, "category": "tech", "published_at": None},
            {"tech": 0.8},
        )
        assert set(b.keys()) == {"cosine", "category", "recency", "composite"}

    def test_weights_sum_to_one(self):
        # contract guard
        assert pytest.approx(W_COSINE + W_CATEGORY + W_RECENCY) == 1.0


# ── Fake pg client ───────────────────────────────────────────────────────────


class _FakePg:
    """Drop-in PgVectorV2Client substitute for unit-level Agent tests."""

    def __init__(self):
        self.feed_rows: List[Dict[str, Any]] = []
        self.candidate_rows: List[Dict[str, Any]] = []
        self.embeddings: Dict[str, List[float]] = {}
        # Recordings
        self.get_feed_calls: List[Dict[str, Any]] = []
        self.find_candidates_calls: List[Dict[str, Any]] = []
        self.embedding_calls: List[Dict[str, Any]] = []

    def get_feed(self, mbti_type, limit=20, since_date=None):
        self.get_feed_calls.append({
            "mbti_type": mbti_type, "limit": limit, "since_date": since_date,
        })
        return list(self.feed_rows)

    def find_feed_candidates(
        self, user_mbti, preference_embedding, exclude_news_ids, limit=100,
    ):
        self.find_candidates_calls.append({
            "user_mbti": user_mbti,
            "exclude_news_ids": list(exclude_news_ids),
            "limit": limit,
            "has_embedding": preference_embedding is not None,
        })
        return list(self.candidate_rows)

    def get_version_embeddings(self, news_ids, mbti_group):
        self.embedding_calls.append({
            "news_ids": list(news_ids), "mbti_group": mbti_group,
        })
        return {nid: self.embeddings[nid] for nid in news_ids if nid in self.embeddings}


def _ctx(
    user_id="alice",
    mbti_type="INTJ",
    has_profile=True,
    embedding=None,
    weights=None,
    recent_ids=None,
):
    return UserContext(
        user_id=user_id,
        mbti_type=mbti_type,
        mbti_group=mbti_type[1:3] if mbti_type else None,
        category_weights=weights or {},
        preference_embedding=embedding,
        recent_news_ids=recent_ids or [],
        has_profile=has_profile,
    )


# ── Constructor ──────────────────────────────────────────────────────────────


class TestConstructor:
    def test_invalid_mmr_lambda_raises(self):
        for bad in (-0.1, 1.1, 2.0):
            with pytest.raises(ValueError):
                RecommendAgent(pg_client=_FakePg(), mmr_lambda=bad)

    def test_valid_mmr_lambda_boundary(self):
        # Exactly 0.0 and 1.0 should be accepted (closed interval)
        RecommendAgent(pg_client=_FakePg(), mmr_lambda=0.0)
        RecommendAgent(pg_client=_FakePg(), mmr_lambda=1.0)

    def test_invalid_category_cap_raises(self):
        for bad in (0.0, -0.1, 1.1):
            with pytest.raises(ValueError):
                RecommendAgent(pg_client=_FakePg(), category_cap_ratio=bad)

    def test_default_constructor_uses_provided_pg(self):
        pg = _FakePg()
        agent = RecommendAgent(pg_client=pg)
        assert agent._mmr_lambda == DEFAULT_MMR_LAMBDA
        assert agent._category_cap_ratio == DEFAULT_CATEGORY_CAP_RATIO


# ── recommend() routing ──────────────────────────────────────────────────────


class TestRecommendRouting:
    def test_no_mbti_group_returns_empty(self):
        agent = RecommendAgent(pg_client=_FakePg())
        ctx = UserContext(
            user_id="ghost",
            mbti_type=None,
            mbti_group=None,
            category_weights={},
            preference_embedding=None,
            has_profile=False,
        )
        assert agent.recommend(ctx) == []

    def test_no_profile_uses_cold_path(self):
        pg = _FakePg()
        pg.feed_rows = [
            {"news_id": "n1", "mbti_type": "NT", "category": "economy",
             "published_at": None},
        ]
        agent = RecommendAgent(pg_client=pg)
        ctx = _ctx(has_profile=False, embedding=None)
        out = agent.recommend(ctx, limit=5)
        assert len(pg.get_feed_calls) == 1
        assert pg.get_feed_calls[0]["mbti_type"] == "NT"
        assert len(pg.find_candidates_calls) == 0
        assert len(pg.embedding_calls) == 0
        assert all(r.path == "cold" for r in out)

    def test_profile_no_embedding_uses_cold_path(self):
        pg = _FakePg()
        pg.feed_rows = [
            {"news_id": "n1", "mbti_type": "NT", "category": "economy"},
        ]
        agent = RecommendAgent(pg_client=pg)
        ctx = _ctx(has_profile=True, embedding=None)
        agent.recommend(ctx)
        assert len(pg.get_feed_calls) == 1
        assert len(pg.find_candidates_calls) == 0

    def test_warm_path_when_profile_and_embedding(self):
        pg = _FakePg()
        pg.candidate_rows = [{
            "news_id": "n1", "mbti_type": "NT", "category": "economy",
            "published_at": datetime.now(timezone.utc), "distance": 0.1,
        }]
        agent = RecommendAgent(pg_client=pg)
        ctx = _ctx(has_profile=True, embedding=[0.1] * 1024)
        out = agent.recommend(ctx)
        assert len(pg.find_candidates_calls) == 1
        call = pg.find_candidates_calls[0]
        assert call["user_mbti"] == "NT"
        assert call["has_embedding"] is True
        assert call["limit"] == DEFAULT_CANDIDATE_LIMIT
        assert all(r.path == "warm" for r in out)

    def test_recent_news_ids_passed_through_to_exclude(self):
        pg = _FakePg()
        agent = RecommendAgent(pg_client=pg)
        ctx = _ctx(
            has_profile=True, embedding=[0.1] * 1024,
            recent_ids=["n_seen_1", "n_seen_2"],
        )
        agent.recommend(ctx)
        assert pg.find_candidates_calls[0]["exclude_news_ids"] == [
            "n_seen_1", "n_seen_2",
        ]


# ── Stage 2: scoring ─────────────────────────────────────────────────────────


class TestScoreCandidates:
    def test_results_sorted_descending(self):
        now = datetime.now(timezone.utc)
        pg = _FakePg()
        pg.candidate_rows = [
            {"news_id": "low", "mbti_type": "NT", "category": "economy",
             "published_at": now - timedelta(days=30), "distance": 0.9},
            {"news_id": "high", "mbti_type": "NT", "category": "tech",
             "published_at": now, "distance": 0.0},
            {"news_id": "mid", "mbti_type": "NT", "category": "tech",
             "published_at": now - timedelta(days=3), "distance": 0.5},
        ]
        # mmr_lambda=1.0 → MMR equals raw score (no diversity damping)
        # category_cap_ratio=1.0 → all 3 fit (no cap)
        agent = RecommendAgent(
            pg_client=pg, mmr_lambda=1.0, category_cap_ratio=1.0,
        )
        ctx = _ctx(embedding=[0.1] * 1024, weights={"tech": 0.8})
        out = agent.recommend(ctx, limit=3)
        assert [r.news_id for r in out] == ["high", "mid", "low"]

    def test_score_breakdown_present_warm_path(self):
        pg = _FakePg()
        pg.candidate_rows = [{
            "news_id": "n1", "mbti_type": "NT", "category": "economy",
            "published_at": datetime.now(timezone.utc), "distance": 0.0,
        }]
        agent = RecommendAgent(pg_client=pg, mmr_lambda=1.0)
        ctx = _ctx(embedding=[0.1] * 1024)
        out = agent.recommend(ctx)
        assert out[0].score_breakdown is not None
        assert set(out[0].score_breakdown.keys()) == {
            "cosine", "category", "recency", "composite",
        }

    def test_score_breakdown_absent_cold_path(self):
        pg = _FakePg()
        pg.feed_rows = [{
            "news_id": "n1", "mbti_type": "NT", "category": "economy",
        }]
        agent = RecommendAgent(pg_client=pg)
        ctx = _ctx(has_profile=False)
        out = agent.recommend(ctx)
        assert out[0].score_breakdown is None
        assert out[0].score == 0.0


# ── Stage 3: MMR + category cap ──────────────────────────────────────────────


class TestDiversifyCategoryCap:
    def test_cap_enforced_then_topup_fills_remaining(self):
        """8 candidates same category, cap_ratio=0.4, limit=5.
        cap = ceil(5 × 0.4) = 2 → MMR picks 2, top-up fills 3 more.
        Result: 5 items returned (limit honored)."""
        pg = _FakePg()
        now = datetime.now(timezone.utc)
        pg.candidate_rows = [
            {"news_id": f"n{i}", "mbti_type": "NT", "category": "economy",
             "published_at": now, "distance": 0.0 + i * 0.01}
            for i in range(8)
        ]
        # Identical embeddings → no MMR diversity differentiation
        for c in pg.candidate_rows:
            pg.embeddings[c["news_id"]] = [0.5] * 4
        agent = RecommendAgent(
            pg_client=pg, mmr_lambda=1.0, category_cap_ratio=0.4,
        )
        ctx = _ctx(embedding=[0.5] * 1024)
        out = agent.recommend(ctx, limit=5)
        assert len(out) == 5

    def test_cap_distributes_across_categories(self):
        """5 in 'economy' + 5 in 'tech', cap=0.4, limit=5.
        cap_per_cat = ceil(5 × 0.4) = 2. With identical scores, MMR
        should pick 2 from each + 1 top-up → 5 total."""
        pg = _FakePg()
        now = datetime.now(timezone.utc)
        rows = []
        for i in range(5):
            rows.append({
                "news_id": f"e{i}", "mbti_type": "NT", "category": "economy",
                "published_at": now, "distance": 0.5,
            })
            rows.append({
                "news_id": f"t{i}", "mbti_type": "NT", "category": "tech",
                "published_at": now, "distance": 0.5,
            })
        pg.candidate_rows = rows
        agent = RecommendAgent(
            pg_client=pg, mmr_lambda=1.0, category_cap_ratio=0.4,
        )
        ctx = _ctx(embedding=[0.1] * 1024)
        out = agent.recommend(ctx, limit=5)
        assert len(out) == 5
        cats = [r.payload["category"] for r in out]
        # MMR phase respects cap: ≤2 economy + ≤2 tech in first 4
        first_four_cats = cats[:4]
        assert first_four_cats.count("economy") <= 2
        assert first_four_cats.count("tech") <= 2


class TestDiversifyMMR:
    def test_diversity_breaks_score_ties(self):
        """3 candidates with identical scores. Embeddings:
        a, b are parallel (high sim → diversity penalty)
        c is orthogonal to a/b (no penalty).
        With λ=0.5 and category_cap=1.0, MMR should pick c second."""
        pg = _FakePg()
        now = datetime.now(timezone.utc)
        pg.candidate_rows = [
            {"news_id": "a", "mbti_type": "NT", "category": "cat_a",
             "published_at": now, "distance": 0.0},
            {"news_id": "b", "mbti_type": "NT", "category": "cat_b",
             "published_at": now, "distance": 0.0},
            {"news_id": "c", "mbti_type": "NT", "category": "cat_c",
             "published_at": now, "distance": 0.0},
        ]
        pg.embeddings["a"] = [1.0, 0.0]
        pg.embeddings["b"] = [1.0, 0.0]   # parallel to a
        pg.embeddings["c"] = [0.0, 1.0]   # orthogonal
        agent = RecommendAgent(
            pg_client=pg, mmr_lambda=0.5, category_cap_ratio=1.0,
        )
        ctx = _ctx(embedding=[0.1] * 1024)
        out = agent.recommend(ctx, limit=2)
        ids = [r.news_id for r in out]
        # Whatever was picked first (any of a/b/c — tied), c is the
        # most-diverse second pick because of orthogonal embedding.
        # If a or b picked first, c should be 2nd.
        # If c picked first, a or b 2nd.
        assert "c" in ids

    def test_lambda_one_disables_diversity(self):
        """λ=1.0 → MMR = score, ignoring pairwise sim. Order should be
        pure score-desc."""
        pg = _FakePg()
        now = datetime.now(timezone.utc)
        pg.candidate_rows = [
            {"news_id": "a", "mbti_type": "NT", "category": "cat_a",
             "published_at": now, "distance": 0.5},
            {"news_id": "b", "mbti_type": "NT", "category": "cat_b",
             "published_at": now, "distance": 0.0},
            {"news_id": "c", "mbti_type": "NT", "category": "cat_c",
             "published_at": now, "distance": 0.3},
        ]
        # Embeddings irrelevant when λ=1.0
        agent = RecommendAgent(
            pg_client=pg, mmr_lambda=1.0, category_cap_ratio=1.0,
        )
        ctx = _ctx(embedding=[0.1] * 1024)
        out = agent.recommend(ctx, limit=3)
        # By score: b (cosine=1.0) > c (0.7) > a (0.5)
        assert [r.news_id for r in out] == ["b", "c", "a"]

    def test_missing_embeddings_gracefully_handled(self):
        """Candidates without embeddings should still be returned —
        just with no diversity penalty applied."""
        pg = _FakePg()
        now = datetime.now(timezone.utc)
        pg.candidate_rows = [
            {"news_id": "with_emb", "mbti_type": "NT", "category": "cat_a",
             "published_at": now, "distance": 0.0},
            {"news_id": "without_emb", "mbti_type": "NT", "category": "cat_b",
             "published_at": now, "distance": 0.1},
        ]
        # Only one has an embedding registered
        pg.embeddings["with_emb"] = [1.0, 0.0]
        # without_emb has no entry → get_version_embeddings won't return it
        agent = RecommendAgent(
            pg_client=pg, mmr_lambda=0.5, category_cap_ratio=1.0,
        )
        ctx = _ctx(embedding=[0.1] * 1024)
        out = agent.recommend(ctx, limit=2)
        # Both returned despite missing embedding for one
        assert len(out) == 2
        ids = {r.news_id for r in out}
        assert ids == {"with_emb", "without_emb"}


class TestDiversifyEdgeCases:
    def test_empty_candidates_returns_empty(self):
        pg = _FakePg()  # candidate_rows = [] by default
        agent = RecommendAgent(pg_client=pg)
        ctx = _ctx(embedding=[0.1] * 1024)
        assert agent.recommend(ctx) == []

    def test_limit_larger_than_candidates_returns_all(self):
        pg = _FakePg()
        now = datetime.now(timezone.utc)
        pg.candidate_rows = [
            {"news_id": f"n{i}", "mbti_type": "NT", "category": "economy",
             "published_at": now, "distance": 0.0}
            for i in range(3)
        ]
        agent = RecommendAgent(
            pg_client=pg, mmr_lambda=1.0, category_cap_ratio=1.0,
        )
        ctx = _ctx(embedding=[0.1] * 1024)
        out = agent.recommend(ctx, limit=20)
        assert len(out) == 3


# ── Integration: DoD requirement ─────────────────────────────────────────────


@pytest.mark.integration
@pytest.mark.skipif(
    not (os.getenv("PG_V2_HOST") and os.getenv("PG_V2_PASSWORD")),
    reason="PG_V2_HOST/PG_V2_PASSWORD required",
)
class TestRecommendAgentLive:
    """Live PG test fulfilling the TASK-3.3 DoD: 10 users → different feeds."""

    PREFIX = "test_v2_3_3_live_"

    @pytest.fixture
    def pg(self):
        from v2.clients.pgvector_v2_client import PgVectorV2Client
        c = PgVectorV2Client()
        # Pre-wipe
        c.conn.run(
            f"DELETE FROM article_versions WHERE news_id LIKE '{self.PREFIX}%'"
        )
        c.conn.run(
            f"DELETE FROM articles WHERE news_id LIKE '{self.PREFIX}%'"
        )
        c.conn.run(
            f"DELETE FROM user_profiles WHERE user_id LIKE '{self.PREFIX}%'"
        )
        yield c
        # Post-wipe
        c.conn.run(
            f"DELETE FROM article_versions WHERE news_id LIKE '{self.PREFIX}%'"
        )
        c.conn.run(
            f"DELETE FROM articles WHERE news_id LIKE '{self.PREFIX}%'"
        )
        c.conn.run(
            f"DELETE FROM user_profiles WHERE user_id LIKE '{self.PREFIX}%'"
        )
        c.close()

    def _unit_vector(self, rng: random.Random) -> List[float]:
        v = [rng.gauss(0, 1) for _ in range(1024)]
        m = math.sqrt(sum(x * x for x in v))
        return [x / m for x in v]

    def test_ten_users_get_different_feeds(self, pg):
        rng = random.Random(42)
        categories = ["economy", "tech", "society", "politics", "culture"]

        # Insert 50 articles + NT versions, mark all as transformed
        for i in range(50):
            news_id = f"{self.PREFIX}art_{i:02d}"
            vec = self._unit_vector(rng)
            pg.insert_article(
                news_id=news_id,
                metadata={
                    "title": f"Title {i}",
                    "category": categories[i % len(categories)],
                    "published_at": datetime.now(timezone.utc) - timedelta(hours=i),
                },
                embedding=vec,
            )
            pg.insert_article_version(
                news_id=news_id,
                mbti_type="NT",
                metadata={"title": f"NT Title {i}", "body": "body"},
                embedding=vec,
            )
            # Mark transformed so find_feed_candidates picks it up
            pg.update_article_status(news_id, "transformed")

        # 10 users with distinct preference embeddings
        agent = RecommendAgent(pg_client=pg)
        feeds: Dict[str, List[str]] = {}
        for u in range(10):
            uid = f"{self.PREFIX}user_{u:02d}"
            pref = self._unit_vector(rng)
            cat_w = {c: rng.random() for c in categories}
            pg.upsert_user_profile(
                user_id=uid,
                mbti_type="INTJ",
                category_weights=cat_w,
                preference_embedding=pref,
            )

            ctx = UserContext(
                user_id=uid,
                mbti_type="INTJ",
                mbti_group="NT",
                category_weights=cat_w,
                preference_embedding=pref,
                recent_news_ids=[],
                has_profile=True,
            )
            ranked = agent.recommend(ctx, limit=10)
            feeds[uid] = [r.news_id for r in ranked]

        # Each user should get 10 articles
        for uid, ids in feeds.items():
            assert len(ids) == 10, f"{uid}: got {len(ids)} articles, expected 10"

        # Pairwise jaccard overlap. With 10 articles each from a pool of
        # 50 and randomized preferences, expected average overlap is well
        # under 50%. Assert avg < 0.7 with margin.
        users = list(feeds.keys())
        overlaps = []
        for i in range(len(users)):
            for j in range(i + 1, len(users)):
                a = set(feeds[users[i]])
                b = set(feeds[users[j]])
                jaccard = len(a & b) / max(1, len(a | b))
                overlaps.append(jaccard)
        avg_overlap = sum(overlaps) / len(overlaps)
        assert avg_overlap < 0.7, (
            f"10 users with random preferences should yield diverse feeds; "
            f"avg jaccard overlap = {avg_overlap:.2f}"
        )
        # Also: at least one pair should be substantially different
        min_overlap = min(overlaps)
        assert min_overlap < 0.5, (
            f"Expected at least one pair of users with <50% overlap; "
            f"min observed = {min_overlap:.2f}"
        )
