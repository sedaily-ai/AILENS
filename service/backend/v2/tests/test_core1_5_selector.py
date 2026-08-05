"""Unit tests for v2.handlers.core1_5_selector.

Strategy: mock PgVectorV2Client + selector_service so the handler's
control flow is tested end-to-end without Bedrock or pg8000. Live
integration is exercised manually post-deploy in TASK-4-C.
"""
from __future__ import annotations

import asyncio
import json
import logging
from datetime import date
from unittest.mock import MagicMock, patch

import pytest

from v2.handlers import core1_5_selector
from v2.handlers.core1_5_selector import (
    BATCH_SIZE,
    TOP_N_PER_MBTI,
    _filter_articles_with_preview,
    _resolve_selection_date,
    lambda_handler,
)


# =============================================================================
# Pure helpers
# =============================================================================


def test_resolve_selection_date_event_iso() -> None:
    assert _resolve_selection_date({"date": "2026-04-25"}) == date(2026, 4, 25)


def test_resolve_selection_date_event_yyyymmdd() -> None:
    assert _resolve_selection_date({"date": "20260425"}) == date(2026, 4, 25)


def test_resolve_selection_date_eventbridge_detail() -> None:
    event = {"detail": {"date": "2026-04-20"}}
    assert _resolve_selection_date(event) == date(2026, 4, 20)


def test_resolve_selection_date_falls_back_to_today_kst() -> None:
    """Empty event → today KST. Patch _today_kst_iso to make deterministic."""
    with patch.object(core1_5_selector, "_today_kst_iso", return_value="2026-04-26"):
        assert _resolve_selection_date({}) == date(2026, 4, 26)


def test_resolve_selection_date_handles_none_detail() -> None:
    """``detail = None`` (minimal EventBridge) → fall through to today."""
    with patch.object(core1_5_selector, "_today_kst_iso", return_value="2026-04-26"):
        assert _resolve_selection_date({"detail": None}) == date(2026, 4, 26)


def test_filter_articles_with_preview_splits_correctly() -> None:
    articles = [
        {"news_id": "n1", "content_preview": "real preview"},
        {"news_id": "n2", "content_preview": ""},
        {"news_id": "n3", "content_preview": "   "},  # whitespace only
        {"news_id": "n4", "content_preview": "another"},
        {"news_id": "n5"},  # missing key entirely
    ]
    eligible, skipped = _filter_articles_with_preview(articles)
    assert [a["news_id"] for a in eligible] == ["n1", "n4"]
    assert skipped == ["n2", "n3", "n5"]


def test_filter_articles_with_preview_handles_empty_input() -> None:
    eligible, skipped = _filter_articles_with_preview([])
    assert eligible == []
    assert skipped == []


# =============================================================================
# lambda_handler — end-to-end with mocks
# =============================================================================


def _invoke(event: dict) -> dict:
    """Run the @handler_decorator-wrapped sync handler. The decorator
    converts our async function to sync via asyncio.run, so we just call."""
    return lambda_handler(event, MagicMock(name="lambda_context"))


def test_handler_options_request_short_circuits() -> None:
    response = _invoke({"httpMethod": "OPTIONS"})
    assert response["statusCode"] == 200


def test_handler_empty_batch_returns_empty_metric() -> None:
    """No raw articles → success_response with processed=0, empty=True."""
    pg = MagicMock()
    pg.find_unscored_articles.return_value = []
    with patch.object(core1_5_selector, "PgVectorV2Client", return_value=pg), \
         patch.object(core1_5_selector, "_today_kst_iso", return_value="2026-04-25"):
        response = _invoke({})
    body = json.loads(response["body"])
    assert body["processed"] == 0
    assert body["empty"] is True
    assert body["date"] == "2026-04-25"
    pg.find_unscored_articles.assert_called_once_with(date(2026, 4, 25), limit=BATCH_SIZE)
    pg.upsert_selection_score.assert_not_called()
    pg.rerank_selections.assert_not_called()


def test_handler_skips_articles_without_preview() -> None:
    """Articles with empty content_preview are filtered out before scoring.
    If ALL articles lack preview, scoring/rerank are skipped entirely."""
    pg = MagicMock()
    pg.find_unscored_articles.return_value = [
        {"news_id": "n1", "title": "t1", "category": "경제", "content_preview": ""},
        {"news_id": "n2", "title": "t2", "category": "경제"},  # missing key
    ]
    with patch.object(core1_5_selector, "PgVectorV2Client", return_value=pg), \
         patch.object(core1_5_selector, "_today_kst_iso", return_value="2026-04-25"):
        response = _invoke({})
    body = json.loads(response["body"])
    assert body["processed"] == 0
    assert body["skipped_no_preview"] == 2
    pg.upsert_selection_score.assert_not_called()
    pg.rerank_selections.assert_not_called()


def test_handler_full_pipeline_upserts_and_reranks() -> None:
    """Happy path: 2 articles with preview → 2 × 4 = 8 upserts + 4 rerank calls."""
    pg = MagicMock()
    pg.find_unscored_articles.return_value = [
        {"news_id": "n1", "title": "t1", "category": "경제", "content_preview": "p1"},
        {"news_id": "n2", "title": "t2", "category": "IT_과학", "content_preview": "p2"},
    ]
    pg.rerank_selections.return_value = 2  # both got selected per group

    fake_scores = {
        "n1": {
            "nt_score": 9.0, "nf_score": 4.0, "st_score": 8.0,
            "sf_score": 5.0, "quality": 8.0,
        },
        "n2": {
            "nt_score": 6.0, "nf_score": 8.0, "st_score": 5.0,
            "sf_score": 9.0, "quality": 7.0,
        },
    }

    async def _mock_score(*args, **kwargs):
        return fake_scores

    with patch.object(core1_5_selector, "PgVectorV2Client", return_value=pg), \
         patch.object(core1_5_selector, "make_nova_client", return_value=MagicMock()), \
         patch.object(core1_5_selector, "load_prompt", return_value="SYS"), \
         patch.object(core1_5_selector, "score_articles", side_effect=_mock_score), \
         patch.object(core1_5_selector, "_today_kst_iso", return_value="2026-04-25"):
        response = _invoke({})

    body = json.loads(response["body"])
    assert body["fetched"] == 2
    assert body["eligible"] == 2
    assert body["scored"] == 2
    assert body["upserts"] == 8  # 2 articles × 4 MBTI
    assert body["top_n_per_mbti"] == TOP_N_PER_MBTI
    assert body["rerank"] == {"NT": 2, "NF": 2, "ST": 2, "SF": 2}

    # 8 upsert calls (2 articles × 4 MBTI groups)
    assert pg.upsert_selection_score.call_count == 8
    # 4 rerank calls (one per MBTI)
    assert pg.rerank_selections.call_count == 4


def test_handler_upsert_uses_correct_composite_score() -> None:
    """Verify the composite_score formula 0.7*mbti + 0.3*quality is what
    gets passed to upsert_selection_score."""
    pg = MagicMock()
    pg.find_unscored_articles.return_value = [
        {"news_id": "n1", "title": "t1", "category": "경제", "content_preview": "p1"},
    ]
    pg.rerank_selections.return_value = 1

    fake_scores = {
        "n1": {
            "nt_score": 10.0, "nf_score": 0.0, "st_score": 5.0,
            "sf_score": 3.0, "quality": 6.0,
        }
    }

    async def _mock_score(*args, **kwargs):
        return fake_scores

    with patch.object(core1_5_selector, "PgVectorV2Client", return_value=pg), \
         patch.object(core1_5_selector, "make_nova_client", return_value=MagicMock()), \
         patch.object(core1_5_selector, "load_prompt", return_value="SYS"), \
         patch.object(core1_5_selector, "score_articles", side_effect=_mock_score), \
         patch.object(core1_5_selector, "_today_kst_iso", return_value="2026-04-25"):
        _invoke({})

    # Find the NT call (10.0 mbti × 0.7 + 6.0 quality × 0.3 = 8.8)
    nt_call = next(
        c for c in pg.upsert_selection_score.call_args_list
        if c.kwargs["mbti_type"] == "NT"
    )
    assert nt_call.kwargs["mbti_score"] == 10.0
    assert nt_call.kwargs["quality_score"] == 6.0
    assert nt_call.kwargs["composite_score"] == pytest.approx(10.0 * 0.7 + 6.0 * 0.3)
    assert nt_call.kwargs["selection_date"] == date(2026, 4, 25)
    assert nt_call.kwargs["news_id"] == "n1"


def test_handler_rerank_called_with_correct_top_n() -> None:
    """Each rerank_selections call uses TOP_N_PER_MBTI (= 20) for the day."""
    pg = MagicMock()
    pg.find_unscored_articles.return_value = [
        {"news_id": "n1", "title": "t1", "category": "경제", "content_preview": "p"},
    ]
    pg.rerank_selections.return_value = 1

    async def _mock_score(*args, **kwargs):
        return {
            "n1": {
                "nt_score": 5.0, "nf_score": 5.0, "st_score": 5.0,
                "sf_score": 5.0, "quality": 5.0,
            }
        }

    with patch.object(core1_5_selector, "PgVectorV2Client", return_value=pg), \
         patch.object(core1_5_selector, "make_nova_client", return_value=MagicMock()), \
         patch.object(core1_5_selector, "load_prompt", return_value="SYS"), \
         patch.object(core1_5_selector, "score_articles", side_effect=_mock_score), \
         patch.object(core1_5_selector, "_today_kst_iso", return_value="2026-04-25"):
        _invoke({})

    for call in pg.rerank_selections.call_args_list:
        assert call.kwargs.get("top_n", call.args[2] if len(call.args) > 2 else None) == TOP_N_PER_MBTI
        # selection_date is positional or kw
        date_arg = call.kwargs.get("selection_date") or call.args[0]
        assert date_arg == date(2026, 4, 25)


def test_handler_partial_skip_continues_with_eligible() -> None:
    """1 article with preview, 1 without → process the eligible one only."""
    pg = MagicMock()
    pg.find_unscored_articles.return_value = [
        {"news_id": "n1", "title": "t1", "category": "경제", "content_preview": "p1"},
        {"news_id": "n2", "title": "t2", "category": "경제", "content_preview": ""},
    ]
    pg.rerank_selections.return_value = 1

    async def _mock_score(*args, **kwargs):
        return {
            "n1": {
                "nt_score": 7.0, "nf_score": 5.0, "st_score": 6.0,
                "sf_score": 4.0, "quality": 7.0,
            }
        }

    with patch.object(core1_5_selector, "PgVectorV2Client", return_value=pg), \
         patch.object(core1_5_selector, "make_nova_client", return_value=MagicMock()), \
         patch.object(core1_5_selector, "load_prompt", return_value="SYS"), \
         patch.object(core1_5_selector, "score_articles", side_effect=_mock_score), \
         patch.object(core1_5_selector, "_today_kst_iso", return_value="2026-04-25"):
        response = _invoke({})

    body = json.loads(response["body"])
    assert body["fetched"] == 2
    assert body["eligible"] == 1
    assert body["skipped_no_preview"] == 1
    # Only n1 upserted: 4 calls (one per MBTI)
    assert pg.upsert_selection_score.call_count == 4
    # Rerank still runs for all 4 groups
    assert pg.rerank_selections.call_count == 4


def test_handler_explicit_date_event_used() -> None:
    """Event ``date`` overrides today_kst."""
    pg = MagicMock()
    pg.find_unscored_articles.return_value = []
    with patch.object(core1_5_selector, "PgVectorV2Client", return_value=pg):
        response = _invoke({"date": "2026-03-15"})
    body = json.loads(response["body"])
    assert body["date"] == "2026-03-15"
    pg.find_unscored_articles.assert_called_once_with(
        date(2026, 3, 15), limit=BATCH_SIZE
    )
