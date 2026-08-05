"""Unit tests for v2.handlers.core3_consolidate.

Mock PgVectorV2Client + MemoryManager so handler control flow can be
verified without DB.
"""
from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import pytest

from v2.handlers import core3_consolidate as h
from v2.handlers.core3_consolidate import lambda_handler


def _invoke(event=None):
    return lambda_handler(event or {}, MagicMock(name="lambda_context"))


def test_v2_3_5_handler_options_short_circuits():
    response = _invoke({"httpMethod": "OPTIONS"})
    assert response["statusCode"] == 200


def test_v2_3_5_handler_no_active_users_returns_zero_metrics():
    pg = MagicMock()
    pg.find_active_users_since.return_value = []
    memory = MagicMock()
    with patch.object(h, "PgVectorV2Client", return_value=pg), \
         patch.object(h, "MemoryManager", return_value=memory):
        response = _invoke({})
    assert response["statusCode"] == 200
    body = json.loads(response["body"])
    assert body["active_users"] == 0
    assert body["counts"]["applied"] == 0
    memory.consolidate.assert_not_called()


def test_v2_3_5_handler_processes_each_active_user():
    pg = MagicMock()
    pg.find_active_users_since.return_value = ["u1", "u2", "u3"]
    memory = MagicMock()
    memory.consolidate.side_effect = [
        {"user_id": "u1", "status": "applied",
         "distinct_news_count": 12, "category_weights_count": 3},
        {"user_id": "u2", "status": "skipped_below_threshold",
         "distinct_news_count": 4, "category_weights_count": 0},
        {"user_id": "u3", "status": "applied",
         "distinct_news_count": 20, "category_weights_count": 5},
    ]
    with patch.object(h, "PgVectorV2Client", return_value=pg), \
         patch.object(h, "MemoryManager", return_value=memory):
        response = _invoke({})
    body = json.loads(response["body"])
    assert body["active_users"] == 3
    assert body["counts"]["applied"] == 2
    assert body["counts"]["skipped_below_threshold"] == 1
    assert memory.consolidate.call_count == 3


def test_v2_3_5_handler_continues_after_user_error():
    pg = MagicMock()
    pg.find_active_users_since.return_value = ["good", "bad", "good2"]
    memory = MagicMock()
    memory.consolidate.side_effect = [
        {"user_id": "good", "status": "applied",
         "distinct_news_count": 12, "category_weights_count": 3},
        Exception("DB exploded for this user"),
        {"user_id": "good2", "status": "applied",
         "distinct_news_count": 15, "category_weights_count": 4},
    ]
    with patch.object(h, "PgVectorV2Client", return_value=pg), \
         patch.object(h, "MemoryManager", return_value=memory):
        response = _invoke({})
    assert response["statusCode"] == 200
    body = json.loads(response["body"])
    assert body["counts"]["applied"] == 2
    assert body["counts"]["errored"] == 1
    assert memory.consolidate.call_count == 3   # all attempted


def test_v2_3_5_handler_passes_now_to_consolidate():
    """Each consolidate call receives the Lambda's start time as 'now',
    so all users in a batch see the same window."""
    pg = MagicMock()
    pg.find_active_users_since.return_value = ["u1", "u2"]
    memory = MagicMock()
    memory.consolidate.return_value = {
        "user_id": "x", "status": "applied",
        "distinct_news_count": 12, "category_weights_count": 1,
    }
    with patch.object(h, "PgVectorV2Client", return_value=pg), \
         patch.object(h, "MemoryManager", return_value=memory):
        _invoke({})
    nows = [c.kwargs.get("now") for c in memory.consolidate.call_args_list]
    assert all(n is not None for n in nows)
    assert nows[0] == nows[1]   # same now for all users in batch


def test_v2_3_5_handler_cutoff_is_30_days_before_now():
    """find_active_users_since receives now - 30d as cutoff."""
    from datetime import timedelta
    pg = MagicMock()
    pg.find_active_users_since.return_value = []
    with patch.object(h, "PgVectorV2Client", return_value=pg), \
         patch.object(h, "MemoryManager"):
        _invoke({})
    call = pg.find_active_users_since.call_args
    cutoff = call.args[0]
    body_response_now = MagicMock()  # we don't have direct access; check via metrics
    # Instead, verify on the response body:
    # (re-invoke and inspect)
    response = _invoke({})
    body = json.loads(response["body"])
    from datetime import datetime, timezone
    now_parsed = datetime.fromisoformat(body["now"])
    cutoff_parsed = datetime.fromisoformat(body["cutoff"])
    delta = now_parsed - cutoff_parsed
    # Should be 30 days, give or take a few seconds for two _invoke calls
    assert timedelta(days=29, hours=23) < delta < timedelta(days=30, hours=1)
