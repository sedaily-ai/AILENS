"""Tests for ContextBroker — TASK-3.2.

Pure unit tests using a fake MemoryManager — no live infra needed.
The broker is glue logic; integration coverage comes via the live
MemoryManager tests in test_memory_manager.py.

Test row prefix: ``test_v2_3_2_`` — registered in conftest's
_TEST_PREFIXES (Round 5-A doesn't actually write rows from this file,
but the prefix is reserved for future expansion).
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

import pytest

from v2.core3.context_broker import ContextBroker, UserContext


# ── Fake MemoryManager ───────────────────────────────────────────────────────


class _FakeMemory:
    """Drop-in MemoryManager substitute with controllable returns.

    Tests prime the four ``return_*`` attributes, then assert the
    Broker assembles them correctly.
    """

    def __init__(self):
        self.return_semantic: Optional[Dict[str, Any]] = None
        self.return_procedural: Optional[Dict[str, Any]] = None
        self.return_episodic: List[Dict[str, Any]] = []
        # Call recording
        self.semantic_calls: List[str] = []
        self.procedural_calls: List[str] = []
        self.episodic_calls: List[Dict[str, Any]] = []

    def get_semantic(self, user_id: str):
        self.semantic_calls.append(user_id)
        return self.return_semantic

    def get_procedural(self, user_id: str):
        self.procedural_calls.append(user_id)
        return self.return_procedural

    def get_episodic(self, user_id: str, limit: int = 100):
        self.episodic_calls.append({"user_id": user_id, "limit": limit})
        return self.return_episodic


# ── Tests ────────────────────────────────────────────────────────────────────


class TestUserContextDataclassShape:
    def test_required_fields_only(self):
        ctx = UserContext(
            user_id="alice",
            mbti_type="INTJ",
            mbti_group="NT",
            category_weights={},
            preference_embedding=None,
        )
        assert ctx.recent_news_ids == []
        assert ctx.has_profile is False


class TestGetUserContextRequestType:
    def test_unsupported_request_type_raises(self):
        cb = ContextBroker(memory_manager=_FakeMemory())
        for bad in ("chat", "search", "podcast", "anything"):
            with pytest.raises(NotImplementedError):
                cb.get_user_context("alice", request_type=bad)

    def test_default_request_type_is_feed(self):
        mem = _FakeMemory()
        cb = ContextBroker(memory_manager=mem)
        ctx = cb.get_user_context("alice")  # no request_type
        assert isinstance(ctx, UserContext)


class TestGetUserContextColdUser:
    def test_no_profile_returns_empty_context(self):
        mem = _FakeMemory()
        # Defaults: semantic=None, procedural=None, episodic=[]
        cb = ContextBroker(memory_manager=mem)

        ctx = cb.get_user_context("ghost")

        assert ctx.user_id == "ghost"
        assert ctx.has_profile is False
        assert ctx.mbti_type is None
        assert ctx.mbti_group is None
        assert ctx.category_weights == {}
        assert ctx.preference_embedding is None
        assert ctx.recent_news_ids == []

    def test_episodic_loaded_even_without_profile(self):
        """An anonymous-like user might have interactions logged
        against their user_id even before their profile is created
        (e.g. event arrives before bootstrap completes). Broker must
        still surface those in recent_news_ids."""
        mem = _FakeMemory()
        mem.return_episodic = [
            {"news_id": "n1", "created_at": datetime.now(timezone.utc)},
        ]
        cb = ContextBroker(memory_manager=mem)
        ctx = cb.get_user_context("ghost")
        assert ctx.has_profile is False
        assert ctx.recent_news_ids == ["n1"]


class TestGetUserContextWarmUser:
    def test_full_context_assembled(self):
        mem = _FakeMemory()
        mem.return_semantic = {"mbti_type": "INTJ"}
        mem.return_procedural = {
            "category_weights": {"tech": 0.7, "economy": 0.3},
            "preference_embedding": [0.5] * 1024,
        }
        mem.return_episodic = [
            {"news_id": "n3", "created_at": datetime.now(timezone.utc)},
            {"news_id": "n2", "created_at": datetime.now(timezone.utc)},
            {"news_id": "n1", "created_at": datetime.now(timezone.utc)},
        ]
        cb = ContextBroker(memory_manager=mem)

        ctx = cb.get_user_context("alice")

        assert ctx.user_id == "alice"
        assert ctx.has_profile is True
        assert ctx.mbti_type == "INTJ"
        assert ctx.mbti_group == "NT"
        assert ctx.category_weights == {"tech": 0.7, "economy": 0.3}
        assert ctx.preference_embedding == [0.5] * 1024
        # Newest-first preserved
        assert ctx.recent_news_ids == ["n3", "n2", "n1"]

    def test_episodic_limit_is_30(self):
        mem = _FakeMemory()
        cb = ContextBroker(memory_manager=mem)
        cb.get_user_context("alice")
        assert mem.episodic_calls[0]["limit"] == 30

    def test_invalid_mbti_length_keeps_group_none(self):
        """Defensive — if a row somehow stored a non-4-char mbti_type
        (shouldn't happen given schema CHECK), broker doesn't crash;
        it just leaves mbti_group None."""
        mem = _FakeMemory()
        mem.return_semantic = {"mbti_type": "X"}  # 1-char garbage
        mem.return_procedural = {"category_weights": {}, "preference_embedding": None}
        cb = ContextBroker(memory_manager=mem)

        ctx = cb.get_user_context("alice")
        assert ctx.mbti_type == "X"  # passed through
        assert ctx.mbti_group is None  # but group is None — caller validates


class TestRecentNewsIdsDedupe:
    def test_duplicates_removed_first_occurrence_wins(self):
        mem = _FakeMemory()
        # Episodic is newest-first per get_user_interactions ORDER BY DESC
        mem.return_episodic = [
            {"news_id": "n1", "created_at": datetime.now(timezone.utc)},
            {"news_id": "n2", "created_at": datetime.now(timezone.utc)},
            {"news_id": "n1", "created_at": datetime.now(timezone.utc)},  # dupe
            {"news_id": "n3", "created_at": datetime.now(timezone.utc)},
            {"news_id": "n2", "created_at": datetime.now(timezone.utc)},  # dupe
        ]
        cb = ContextBroker(memory_manager=mem)
        ctx = cb.get_user_context("alice")
        assert ctx.recent_news_ids == ["n1", "n2", "n3"]

    def test_falsy_news_ids_skipped(self):
        mem = _FakeMemory()
        mem.return_episodic = [
            {"news_id": "n1", "created_at": datetime.now(timezone.utc)},
            {"news_id": "", "created_at": datetime.now(timezone.utc)},      # falsy
            {"news_id": None, "created_at": datetime.now(timezone.utc)},   # falsy
            {"news_id": "n2", "created_at": datetime.now(timezone.utc)},
        ]
        cb = ContextBroker(memory_manager=mem)
        ctx = cb.get_user_context("alice")
        assert ctx.recent_news_ids == ["n1", "n2"]

    def test_empty_episodic_yields_empty_list(self):
        mem = _FakeMemory()
        cb = ContextBroker(memory_manager=mem)
        ctx = cb.get_user_context("alice")
        assert ctx.recent_news_ids == []
