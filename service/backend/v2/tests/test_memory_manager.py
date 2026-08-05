"""Tests for MemoryManager — TASK-3.1.

Mix of unit tests (with fakes, no live infra needed) and integration
tests (require PG_V2_HOST/PG_V2_PASSWORD; auto-skipped otherwise).

Test row prefix: ``test_v2_3_1_`` — registered in conftest's
_TEST_PREFIXES so a SIGKILL'd run still gets cleaned up next session.
"""
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import List, Optional

import pytest

from v2.core3.memory_manager import (
    DEFAULT_EPISODIC_LIMIT,
    DEFAULT_SHORT_TERM_MINUTES,
    MemoryManager,
    _MBTI_GROUP_SEEDS,
    _mbti_group_from_full,
    _validate_mbti_full,
)


# ── Unit tests (no infra) ────────────────────────────────────────────────────


class TestValidateMbtiFull:
    def test_valid_input_returns_normalized(self):
        assert _validate_mbti_full("INTJ") == "INTJ"
        assert _validate_mbti_full("intj") == "INTJ"
        assert _validate_mbti_full("  ENFP  ") == "ENFP"

    def test_invalid_input_raises(self):
        for bad in ("", "INT", "INTXX", "XYZW", "NT", None, 123):
            with pytest.raises(ValueError):
                _validate_mbti_full(bad)  # type: ignore[arg-type]


class TestMbtiGroupFromFull:
    def test_extracts_middle_two_chars(self):
        assert _mbti_group_from_full("INTJ") == "NT"
        assert _mbti_group_from_full("ENFP") == "NF"
        assert _mbti_group_from_full("ISTJ") == "ST"
        assert _mbti_group_from_full("ESFP") == "SF"


class TestSeedSentencesArePresent:
    def test_all_four_groups_have_korean_seed(self):
        assert set(_MBTI_GROUP_SEEDS.keys()) == {"NT", "NF", "ST", "SF"}
        for group, text in _MBTI_GROUP_SEEDS.items():
            assert isinstance(text, str)
            assert len(text) > 50, f"{group} seed too short — {len(text)} chars"
            # Quick sanity: at least one Korean char (CJK Unified
            # Ideographs / Hangul Syllables block ranges).
            assert any("가" <= c <= "힯" for c in text), (
                f"{group} seed has no Hangul"
            )


# ── Fakes for integration-free tests of MemoryManager ────────────────────────


class _FakePg:
    """Minimal in-memory ``PgVectorV2Client`` substitute.

    Records every call so tests can assert the right method was hit
    with the right arguments. State per-instance — never shared.
    """

    def __init__(self):
        self.profiles: dict = {}            # user_id → profile dict
        self.embeddings: dict = {}          # user_id → list[float]
        self.interactions: list = []        # newest-first global log
        self.upsert_calls: list = []
        self.get_user_interactions_calls: list = []

    # Profile reads
    def get_user_profile(self, user_id: str):
        return self.profiles.get(user_id)

    def get_preference_embedding(self, user_id: str):
        return self.embeddings.get(user_id)

    # Profile write
    def upsert_user_profile(
        self,
        user_id: str,
        mbti_type,
        category_weights,
        preference_embedding,
    ):
        self.upsert_calls.append({
            "user_id": user_id,
            "mbti_type": mbti_type,
            "category_weights": category_weights,
            "preference_embedding": preference_embedding,
        })
        self.profiles[user_id] = {
            "user_id": user_id,
            "mbti_type": mbti_type,
            "category_weights": category_weights,
            "created_at": datetime.now(timezone.utc),
            "updated_at": datetime.now(timezone.utc),
        }
        if preference_embedding is not None:
            self.embeddings[user_id] = list(preference_embedding)

    # Interaction read
    def get_user_interactions(
        self,
        user_id: str,
        limit: int = 100,
        since: Optional[datetime] = None,
    ):
        self.get_user_interactions_calls.append({
            "user_id": user_id, "limit": limit, "since": since,
        })
        rows = [r for r in self.interactions if r["user_id"] == user_id]
        if since is not None:
            rows = [r for r in rows if r["created_at"] >= since]
        return rows[:limit]


class _FakeEmbed:
    """Returns a deterministic 1024-dim vector based on the input text length."""

    def __init__(self, fixed: Optional[List[float]] = None):
        self._fixed = fixed
        self.embed_calls: list = []

    def embed_text(self, text: str) -> List[float]:
        self.embed_calls.append(text)
        if self._fixed is not None:
            return list(self._fixed)
        # Deterministic mapping that's stable across runs but not all-
        # zeros (avoids triggering any "zero vector" defensive paths in
        # downstream code).
        seed = (len(text) % 7) * 0.01 + 0.1
        return [seed] * 1024


# ── Unit tests using fakes ───────────────────────────────────────────────────


class TestGetShortTerm:
    def test_calls_get_user_interactions_with_time_window(self):
        pg = _FakePg()
        mm = MemoryManager(pg_client=pg, embedding_client=_FakeEmbed())

        mm.get_short_term("alice", window_minutes=15)

        assert len(pg.get_user_interactions_calls) == 1
        call = pg.get_user_interactions_calls[0]
        assert call["user_id"] == "alice"
        assert call["limit"] == 200
        # since should be roughly 15 minutes ago
        delta = datetime.now(timezone.utc) - call["since"]
        assert timedelta(minutes=14) < delta < timedelta(minutes=16)

    def test_default_window_is_30_minutes(self):
        pg = _FakePg()
        mm = MemoryManager(pg_client=pg, embedding_client=_FakeEmbed())
        mm.get_short_term("alice")
        call = pg.get_user_interactions_calls[0]
        delta = datetime.now(timezone.utc) - call["since"]
        assert timedelta(minutes=29) < delta < timedelta(minutes=31)
        assert DEFAULT_SHORT_TERM_MINUTES == 30  # contract guard


class TestGetEpisodic:
    def test_passes_limit_through_no_since(self):
        pg = _FakePg()
        mm = MemoryManager(pg_client=pg, embedding_client=_FakeEmbed())

        mm.get_episodic("bob", limit=42)

        call = pg.get_user_interactions_calls[0]
        assert call["limit"] == 42
        assert call["since"] is None

    def test_default_limit(self):
        pg = _FakePg()
        mm = MemoryManager(pg_client=pg, embedding_client=_FakeEmbed())
        mm.get_episodic("bob")
        assert pg.get_user_interactions_calls[0]["limit"] == DEFAULT_EPISODIC_LIMIT


class TestGetSemantic:
    def test_returns_none_when_no_profile(self):
        pg = _FakePg()
        mm = MemoryManager(pg_client=pg, embedding_client=_FakeEmbed())
        assert mm.get_semantic("ghost") is None

    def test_returns_mbti_type_dict(self):
        pg = _FakePg()
        pg.profiles["alice"] = {
            "user_id": "alice",
            "mbti_type": "INTJ",
            "category_weights": {"tech": 0.5},
            "created_at": None,
            "updated_at": None,
        }
        mm = MemoryManager(pg_client=pg, embedding_client=_FakeEmbed())
        result = mm.get_semantic("alice")
        assert result == {"mbti_type": "INTJ"}


class TestGetProcedural:
    def test_returns_none_when_no_profile(self):
        pg = _FakePg()
        mm = MemoryManager(pg_client=pg, embedding_client=_FakeEmbed())
        assert mm.get_procedural("ghost") is None

    def test_returns_weights_and_embedding(self):
        pg = _FakePg()
        pg.profiles["alice"] = {
            "user_id": "alice",
            "mbti_type": "INTJ",
            "category_weights": {"tech": 0.7, "economy": 0.3},
            "created_at": None,
            "updated_at": None,
        }
        pg.embeddings["alice"] = [0.42] * 1024
        mm = MemoryManager(pg_client=pg, embedding_client=_FakeEmbed())

        result = mm.get_procedural("alice")
        assert result == {
            "category_weights": {"tech": 0.7, "economy": 0.3},
            "preference_embedding": [0.42] * 1024,
        }

    def test_handles_missing_embedding_gracefully(self):
        pg = _FakePg()
        pg.profiles["alice"] = {
            "user_id": "alice",
            "mbti_type": "INTJ",
            "category_weights": {},
            "created_at": None,
            "updated_at": None,
        }
        # No entry in pg.embeddings
        mm = MemoryManager(pg_client=pg, embedding_client=_FakeEmbed())
        result = mm.get_procedural("alice")
        assert result["preference_embedding"] is None

    def test_returns_empty_dict_when_weights_null(self):
        pg = _FakePg()
        pg.profiles["alice"] = {
            "user_id": "alice",
            "mbti_type": "INTJ",
            "category_weights": None,  # JSONB NULL edge
            "created_at": None,
            "updated_at": None,
        }
        mm = MemoryManager(pg_client=pg, embedding_client=_FakeEmbed())
        result = mm.get_procedural("alice")
        assert result["category_weights"] == {}


class TestGetOrCreateProfile:
    def test_invalid_mbti_raises_before_any_io(self):
        pg = _FakePg()
        emb = _FakeEmbed()
        mm = MemoryManager(pg_client=pg, embedding_client=emb)

        with pytest.raises(ValueError):
            mm.get_or_create_profile("alice", "INVALID")

        assert len(pg.upsert_calls) == 0
        assert len(emb.embed_calls) == 0  # no Bedrock call wasted

    def test_existing_profile_returned_unchanged_no_embed(self):
        pg = _FakePg()
        pg.profiles["alice"] = {
            "user_id": "alice",
            "mbti_type": "ENTJ",
            "category_weights": {"economy": 0.9},
            "created_at": None,
            "updated_at": None,
        }
        # Pre-existing embedding too — make sure we don't overwrite
        pg.embeddings["alice"] = [0.99] * 1024
        emb = _FakeEmbed()
        mm = MemoryManager(pg_client=pg, embedding_client=emb)

        result = mm.get_or_create_profile("alice", "ENTJ")

        assert result["mbti_type"] == "ENTJ"
        assert result["category_weights"] == {"economy": 0.9}
        assert len(pg.upsert_calls) == 0  # no write on hit
        assert len(emb.embed_calls) == 0  # no Bedrock call on hit
        assert pg.embeddings["alice"] == [0.99] * 1024  # untouched

    def test_cold_start_seeds_with_group_canonical_embedding(self):
        pg = _FakePg()
        emb = _FakeEmbed(fixed=[0.5] * 1024)
        mm = MemoryManager(pg_client=pg, embedding_client=emb)

        mm.get_or_create_profile("alice", "INTJ")  # NT group

        # Embed called with NT seed text
        assert len(emb.embed_calls) == 1
        assert emb.embed_calls[0] == _MBTI_GROUP_SEEDS["NT"]
        # Upsert recorded with the embedding
        assert len(pg.upsert_calls) == 1
        call = pg.upsert_calls[0]
        assert call["user_id"] == "alice"
        assert call["mbti_type"] == "INTJ"
        assert call["category_weights"] == {}
        assert call["preference_embedding"] == [0.5] * 1024

    def test_cold_start_returns_synthetic_dict_if_reread_fails(self):
        """If get_user_profile somehow returns None right after upsert,
        the bootstrap returns a synthesized dict so the handler still
        gets a valid value — it never sees the post-write read failure."""
        pg = _FakePg()

        # Make get_user_profile always return None even after upsert.
        original_upsert = pg.upsert_user_profile
        def _upsert_no_persist(**kwargs):
            # Record the call but do NOT update self.profiles dict.
            pg.upsert_calls.append(kwargs)
        pg.upsert_user_profile = _upsert_no_persist  # type: ignore

        emb = _FakeEmbed()
        mm = MemoryManager(pg_client=pg, embedding_client=emb)

        result = mm.get_or_create_profile("alice", "INTJ")
        assert result["user_id"] == "alice"
        assert result["mbti_type"] == "INTJ"
        assert result["category_weights"] == {}


# ── Integration tests (require live PG + Bedrock) ────────────────────────────


@pytest.mark.integration
@pytest.mark.skipif(
    not (os.getenv("PG_V2_HOST") and os.getenv("PG_V2_PASSWORD")),
    reason="PG_V2_HOST/PG_V2_PASSWORD required for live MemoryManager test",
)
class TestMemoryManagerLive:
    PREFIX = "test_v2_3_1_live_"

    @pytest.fixture
    def mm(self):
        from v2.clients.pgvector_v2_client import PgVectorV2Client
        # Use real PG, fake embed (avoid Bedrock cost in CI).
        pg = PgVectorV2Client()
        emb = _FakeEmbed(fixed=[0.123] * 1024)
        # Pre-wipe — belt-and-suspenders even though session conftest covers it
        pg.conn.run(
            f"DELETE FROM user_interactions WHERE news_id LIKE '{self.PREFIX}%'"
        )
        pg.conn.run(
            f"DELETE FROM user_profiles WHERE user_id LIKE '{self.PREFIX}%'"
        )
        yield MemoryManager(pg_client=pg, embedding_client=emb)
        pg.conn.run(
            f"DELETE FROM user_interactions WHERE news_id LIKE '{self.PREFIX}%'"
        )
        pg.conn.run(
            f"DELETE FROM user_profiles WHERE user_id LIKE '{self.PREFIX}%'"
        )
        pg.close()

    def test_get_or_create_profile_persists_seeded_embedding(self, mm):
        uid = f"{self.PREFIX}seeded"
        result = mm.get_or_create_profile(uid, "INTJ")
        assert result["mbti_type"] == "INTJ"

        # Procedural read should now return the seeded embedding.
        proc = mm.get_procedural(uid)
        assert proc is not None
        assert proc["preference_embedding"] == pytest.approx(
            [0.123] * 1024, rel=1e-5, abs=1e-5
        )

    def test_short_term_window_excludes_old_interactions(self, mm):
        from v2.clients.pgvector_v2_client import PgVectorV2Client
        pg = PgVectorV2Client()
        uid = f"{self.PREFIX}short_term"

        # Insert an "old" event by manipulating created_at directly,
        # then a recent event via the normal API.
        pg.conn.run(
            """
            INSERT INTO user_interactions
                (user_id, news_id, mbti_type, interaction_type, created_at)
            VALUES
                (:uid, :nid, 'NT', 'click', now() - interval '2 hours')
            """,
            uid=uid,
            nid=f"{self.PREFIX}old_news",
        )
        pg.record_interaction(
            user_id=uid,
            news_id=f"{self.PREFIX}fresh_news",
            mbti_type="NT",
            interaction_type="click",
        )

        recent = mm.get_short_term(uid, window_minutes=30)
        recent_news = {r["news_id"] for r in recent}
        assert f"{self.PREFIX}fresh_news" in recent_news
        assert f"{self.PREFIX}old_news" not in recent_news

        episodic = mm.get_episodic(uid)
        all_news = {r["news_id"] for r in episodic}
        assert f"{self.PREFIX}fresh_news" in all_news
        assert f"{self.PREFIX}old_news" in all_news


# ── Default constructor regression guard (Round 5-C fix) ─────────────────────


class TestDefaultConstructorPassesEndpointUrl:
    """Regression guard for the Round 5-C VPC-routing bug.

    EmbeddingV2Client must receive ``endpoint_url`` from the
    BEDROCK_RUNTIME_ENDPOINT_URL env var when MemoryManager
    default-constructs it. Without this, boto3 resolves the
    public Bedrock hostname which has no route from inside the
    Lambda VPC (Private DNS disabled at the interface endpoint
    per CLAUDE.md), causing 30-second timeouts on first cold-start
    profile-create.

    Tests patch the EmbeddingV2Client class to capture init kwargs.
    """

    def test_v2_3_1_default_passes_env_endpoint_url(self, monkeypatch):
        captured = {}

        class _CapturingEmbed:
            def __init__(self, **kwargs):
                captured.update(kwargs)

        monkeypatch.setattr(
            "v2.core3.memory_manager.EmbeddingV2Client", _CapturingEmbed
        )
        monkeypatch.setenv(
            "BEDROCK_RUNTIME_ENDPOINT_URL",
            "https://vpce-test.bedrock-runtime.us-east-1.vpce.amazonaws.com",
        )
        # Skip pg client construction by injecting a fake
        MemoryManager(pg_client=_FakePg())

        assert "endpoint_url" in captured, (
            "MemoryManager default constructor must pass endpoint_url "
            "to EmbeddingV2Client (regression: Round 5-C VPC routing bug)"
        )
        assert captured["endpoint_url"] == (
            "https://vpce-test.bedrock-runtime.us-east-1.vpce.amazonaws.com"
        )

    def test_v2_3_1_default_passes_empty_string_when_env_unset(self, monkeypatch):
        """When env var is unset, pass empty string (matches
        core1_collector pattern). EmbeddingV2Client treats empty
        string as falsy and skips the boto3 endpoint_url override —
        same behavior as before, but explicit."""
        captured = {}

        class _CapturingEmbed:
            def __init__(self, **kwargs):
                captured.update(kwargs)

        monkeypatch.setattr(
            "v2.core3.memory_manager.EmbeddingV2Client", _CapturingEmbed
        )
        monkeypatch.delenv("BEDROCK_RUNTIME_ENDPOINT_URL", raising=False)
        MemoryManager(pg_client=_FakePg())

        assert captured.get("endpoint_url") == ""

    def test_v2_3_1_injected_embedding_client_skips_construction(
        self, monkeypatch
    ):
        """When caller passes embedding_client explicitly, no
        EmbeddingV2Client construction should happen at all (no env
        var read, no class instantiation)."""
        construction_count = {"n": 0}

        class _ShouldNotBeCalled:
            def __init__(self, **kwargs):
                construction_count["n"] += 1

        monkeypatch.setattr(
            "v2.core3.memory_manager.EmbeddingV2Client", _ShouldNotBeCalled
        )
        fake_embed = _FakeEmbed()
        MemoryManager(pg_client=_FakePg(), embedding_client=fake_embed)

        assert construction_count["n"] == 0, (
            "Injected embedding_client should bypass default construction"
        )


# =============================================================================
# Round 5-D: consolidate + helpers
# =============================================================================


from v2.core3.memory_manager import (
    _DWELL_ENGAGED_MS,
    _event_weight,
    _normalize_category_weights,
)


class TestEventWeight:
    def test_click(self):
        assert _event_weight("click", None, None) == 1.0
        assert _event_weight("click", 100, None) == 1.0  # dwell_ms ignored

    def test_dwell_engaged(self):
        assert _event_weight("dwell", _DWELL_ENGAGED_MS + 1, None) == 2.0
        assert _event_weight("dwell", 10000, None) == 2.0

    def test_dwell_short(self):
        assert _event_weight("dwell", _DWELL_ENGAGED_MS, None) == 1.0
        assert _event_weight("dwell", 1000, None) == 1.0
        assert _event_weight("dwell", None, None) == 1.0

    def test_react(self):
        assert _event_weight("react", None, None) == 3.0

    def test_rate_high(self):
        assert _event_weight("rate", None, 4) == 3.0
        assert _event_weight("rate", None, 5) == 3.0

    def test_rate_neutral(self):
        assert _event_weight("rate", None, 3) == 0.0

    def test_rate_low(self):
        assert _event_weight("rate", None, 1) == -1.0
        assert _event_weight("rate", None, 2) == -1.0

    def test_rate_missing(self):
        assert _event_weight("rate", None, None) == 0.0

    def test_scroll(self):
        assert _event_weight("scroll", None, None) == 1.0

    def test_skip(self):
        assert _event_weight("skip", None, None) == -1.0

    def test_unknown(self):
        assert _event_weight("UNKNOWN", None, None) == 0.0


class TestNormalizeCategoryWeights:
    def test_empty_input(self):
        assert _normalize_category_weights({}) == {}

    def test_all_zero(self):
        assert _normalize_category_weights({"a": 0, "b": 0}) == {}

    def test_all_negative(self):
        assert _normalize_category_weights({"a": -1, "b": -2}) == {}

    def test_normalizes_to_unit_sum(self):
        result = _normalize_category_weights({"a": 2, "b": 3})
        assert result["a"] == pytest.approx(0.4)
        assert result["b"] == pytest.approx(0.6)
        assert sum(result.values()) == pytest.approx(1.0)

    def test_clamps_negative_to_zero_and_renormalizes(self):
        result = _normalize_category_weights({"a": 4, "b": -2, "c": 1})
        # b dropped, total = 5
        assert "b" not in result
        assert result["a"] == pytest.approx(0.8)
        assert result["c"] == pytest.approx(0.2)


class TestConsolidate:
    """consolidate routing — uses _FakePg (defined earlier in this file) +
    canned aggregation responses to drive the four status branches."""

    def test_v2_3_5_skipped_no_profile(self):
        pg = _FakePg()
        # No profile in pg.profiles
        mm = MemoryManager(pg_client=pg, embedding_client=_FakeEmbed())
        result = mm.consolidate("ghost")
        assert result["status"] == "skipped_no_profile"
        assert result["distinct_news_count"] == 0

    def test_v2_3_5_skipped_below_threshold(self):
        pg = _FakePg()
        pg.profiles["alice"] = {
            "user_id": "alice", "mbti_type": "INTJ",
            "category_weights": {}, "created_at": None, "updated_at": None,
        }
        # Stub get_interaction_centroid_data to return < threshold
        pg.get_interaction_centroid_data = lambda uid, since: {
            "distinct_news_count": 5,
            "centroid_embedding": [0.5] * 1024,
            "events": [],
        }
        mm = MemoryManager(pg_client=pg, embedding_client=_FakeEmbed())
        result = mm.consolidate("alice")
        assert result["status"] == "skipped_below_threshold"
        assert result["distinct_news_count"] == 5
        # Profile not modified
        assert len(pg.upsert_calls) == 0

    def test_v2_3_5_skipped_no_centroid(self):
        pg = _FakePg()
        pg.profiles["alice"] = {
            "user_id": "alice", "mbti_type": "INTJ",
            "category_weights": {}, "created_at": None, "updated_at": None,
        }
        pg.get_interaction_centroid_data = lambda uid, since: {
            "distinct_news_count": 15,    # above threshold
            "centroid_embedding": None,   # but no centroid
            "events": [],
        }
        mm = MemoryManager(pg_client=pg, embedding_client=_FakeEmbed())
        result = mm.consolidate("alice")
        assert result["status"] == "skipped_no_centroid"
        assert len(pg.upsert_calls) == 0

    def test_v2_3_5_applied_with_existing_embedding_uses_ewma(self):
        pg = _FakePg()
        pg.profiles["alice"] = {
            "user_id": "alice", "mbti_type": "INTJ",
            "category_weights": {}, "created_at": None, "updated_at": None,
        }
        pg.embeddings["alice"] = [1.0] * 1024     # old (seed)
        centroid = [0.0] * 1024                    # diametrically different

        pg.get_interaction_centroid_data = lambda uid, since: {
            "distinct_news_count": 12,
            "centroid_embedding": list(centroid),
            "events": [
                {"news_id": "n1", "interaction_type": "click",
                 "dwell_ms": None, "rating": None, "category": "tech"},
                {"news_id": "n2", "interaction_type": "click",
                 "dwell_ms": None, "rating": None, "category": "economy"},
            ],
        }
        mm = MemoryManager(pg_client=pg, embedding_client=_FakeEmbed())
        result = mm.consolidate("alice")

        assert result["status"] == "applied"
        assert result["distinct_news_count"] == 12
        assert result["category_weights_count"] == 2

        # Verify EWMA: α=0.2 → new = 0.2×0 + 0.8×1 = 0.8
        assert len(pg.upsert_calls) == 1
        upserted_emb = pg.upsert_calls[0]["preference_embedding"]
        assert upserted_emb[0] == pytest.approx(0.8)
        assert all(v == pytest.approx(0.8) for v in upserted_emb[:10])

        # Verify category_weights normalized to unit sum
        upserted_cats = pg.upsert_calls[0]["category_weights"]
        assert sum(upserted_cats.values()) == pytest.approx(1.0)
        # 1 click each — equal weight
        assert upserted_cats["tech"] == pytest.approx(0.5)
        assert upserted_cats["economy"] == pytest.approx(0.5)

    def test_v2_3_5_applied_no_existing_embedding_uses_centroid_outright(self):
        pg = _FakePg()
        pg.profiles["alice"] = {
            "user_id": "alice", "mbti_type": "INTJ",
            "category_weights": {}, "created_at": None, "updated_at": None,
        }
        # No entry in pg.embeddings → get_preference_embedding returns None
        pg.get_interaction_centroid_data = lambda uid, since: {
            "distinct_news_count": 12,
            "centroid_embedding": [0.5] * 1024,
            "events": [
                {"news_id": "n1", "interaction_type": "click",
                 "dwell_ms": None, "rating": None, "category": "tech"},
            ],
        }
        mm = MemoryManager(pg_client=pg, embedding_client=_FakeEmbed())
        result = mm.consolidate("alice")
        assert result["status"] == "applied"
        # No old embedding → use centroid as-is
        upserted_emb = pg.upsert_calls[0]["preference_embedding"]
        assert upserted_emb == [0.5] * 1024

    def test_v2_3_5_applied_skips_events_without_category(self):
        pg = _FakePg()
        pg.profiles["alice"] = {
            "user_id": "alice", "mbti_type": "INTJ",
            "category_weights": {}, "created_at": None, "updated_at": None,
        }
        pg.embeddings["alice"] = [0.5] * 1024
        pg.get_interaction_centroid_data = lambda uid, since: {
            "distinct_news_count": 12,
            "centroid_embedding": [0.5] * 1024,
            "events": [
                {"news_id": "n1", "interaction_type": "click",
                 "dwell_ms": None, "rating": None, "category": None},
                {"news_id": "n2", "interaction_type": "click",
                 "dwell_ms": None, "rating": None, "category": "tech"},
            ],
        }
        mm = MemoryManager(pg_client=pg, embedding_client=_FakeEmbed())
        result = mm.consolidate("alice")
        upserted_cats = pg.upsert_calls[0]["category_weights"]
        # Only tech survives — null category event dropped
        assert upserted_cats == {"tech": 1.0}

    def test_v2_3_5_negative_only_categories_yield_empty_weights(self):
        pg = _FakePg()
        pg.profiles["alice"] = {
            "user_id": "alice", "mbti_type": "INTJ",
            "category_weights": {"tech": 0.7, "economy": 0.3},  # prior
            "created_at": None, "updated_at": None,
        }
        pg.embeddings["alice"] = [0.5] * 1024
        pg.get_interaction_centroid_data = lambda uid, since: {
            "distinct_news_count": 12,
            "centroid_embedding": [0.5] * 1024,
            "events": [
                {"news_id": f"n{i}", "interaction_type": "skip",
                 "dwell_ms": None, "rating": None, "category": "tech"}
                for i in range(12)
            ],
        }
        mm = MemoryManager(pg_client=pg, embedding_client=_FakeEmbed())
        result = mm.consolidate("alice")
        assert result["status"] == "applied"
        # All-negative → normalized = {} (caller may interpret as "no signal")
        upserted_cats = pg.upsert_calls[0]["category_weights"]
        assert upserted_cats == {}
