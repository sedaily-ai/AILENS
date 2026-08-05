"""Unit tests for v2.handlers.core3_record_interaction.

Strategy: mock PgVectorV2Client + MemoryManager so the handler's
request validation, response shape, and pipeline ordering can be
tested without DB/Bedrock. Live integration validated post-deploy
via curl + spot-check of user_interactions / user_profiles rows.
"""
from __future__ import annotations

import json
from unittest.mock import MagicMock, patch

import pytest

from v2.handlers import core3_record_interaction as h
from v2.handlers.core3_record_interaction import (
    _coerce_int,
    _extract_full_mbti,
    _extract_group_mbti,
    _parse_body,
    lambda_handler,
)


# =============================================================================
# Pure helpers
# =============================================================================


def test_parse_body_dict_passthrough():
    body, err = _parse_body({"body": {"k": "v"}})
    assert err is None
    assert body == {"k": "v"}


def test_parse_body_valid_json_string():
    body, err = _parse_body({"body": '{"k": "v"}'})
    assert err is None
    assert body == {"k": "v"}


def test_parse_body_missing_returns_error():
    body, err = _parse_body({})
    assert body is None
    assert err == "request body is required"


def test_parse_body_empty_string_returns_error():
    body, err = _parse_body({"body": ""})
    assert body is None
    assert err == "request body is required"


def test_parse_body_invalid_json_returns_error():
    body, err = _parse_body({"body": "not json"})
    assert body is None
    assert "valid JSON" in err


def test_parse_body_non_object_json_rejected():
    """JSON arrays / scalars / strings rejected — only objects accepted."""
    for payload in ('[1, 2, 3]', '"string"', '42', 'true', 'null'):
        body, err = _parse_body({"body": payload})
        assert body is None, f"should reject {payload!r}"
        assert "JSON object" in err


def test_extract_full_mbti_accepts_16_codes():
    for code in ("INTJ", "ENFP", "ESTP", "ISFJ"):
        assert _extract_full_mbti(code) == code


def test_extract_full_mbti_normalizes_case():
    assert _extract_full_mbti("intj") == "INTJ"
    assert _extract_full_mbti("  ENFP  ") == "ENFP"


def test_extract_full_mbti_rejects_non_full():
    for bad in (None, "", "NT", "ABCD", "INTX", 123, [], {}):
        assert _extract_full_mbti(bad) is None


def test_extract_group_mbti_from_full():
    assert _extract_group_mbti("INTJ") == "NT"
    assert _extract_group_mbti("ENFP") == "NF"


def test_extract_group_mbti_from_group():
    assert _extract_group_mbti("NT") == "NT"
    assert _extract_group_mbti("nf") == "NF"


def test_extract_group_mbti_returns_none_on_invalid():
    for bad in (None, "", "XX", "ABCD", 123):
        assert _extract_group_mbti(bad) is None


def test_coerce_int_basic():
    assert _coerce_int(5) == 5
    assert _coerce_int("5") == 5
    assert _coerce_int(None) is None


def test_coerce_int_bounds():
    assert _coerce_int(-1, min_val=0) is None
    assert _coerce_int(101, max_val=100) is None
    assert _coerce_int(50, min_val=0, max_val=100) == 50


def test_coerce_int_invalid():
    assert _coerce_int("not a number") is None
    assert _coerce_int([1, 2, 3]) is None


# =============================================================================
# lambda_handler — request validation
# =============================================================================


def _invoke(event):
    return lambda_handler(event, MagicMock(name="lambda_context"))


def test_handler_options_short_circuits():
    response = _invoke({"httpMethod": "OPTIONS"})
    assert response["statusCode"] == 200


def test_handler_missing_body_returns_400():
    pg = MagicMock()
    with patch.object(h, "PgVectorV2Client", return_value=pg):
        response = _invoke({"httpMethod": "POST"})
    assert response["statusCode"] == 400
    pg.record_interaction.assert_not_called()


def test_handler_missing_user_id_returns_400():
    pg = MagicMock()
    with patch.object(h, "PgVectorV2Client", return_value=pg):
        response = _invoke({
            "httpMethod": "POST",
            "body": json.dumps({"news_id": "n1", "interaction_type": "click"}),
        })
    assert response["statusCode"] == 400
    body = json.loads(response["body"])
    assert "user_id" in body.get("error", "").lower()
    pg.record_interaction.assert_not_called()


def test_handler_missing_news_id_returns_400():
    pg = MagicMock()
    with patch.object(h, "PgVectorV2Client", return_value=pg):
        response = _invoke({
            "httpMethod": "POST",
            "body": json.dumps({"user_id": "u1", "interaction_type": "click"}),
        })
    assert response["statusCode"] == 400


def test_handler_missing_interaction_type_returns_400():
    pg = MagicMock()
    with patch.object(h, "PgVectorV2Client", return_value=pg):
        response = _invoke({
            "httpMethod": "POST",
            "body": json.dumps({"user_id": "u1", "news_id": "n1"}),
        })
    assert response["statusCode"] == 400


def test_handler_invalid_interaction_type_returns_400():
    pg = MagicMock()
    with patch.object(h, "PgVectorV2Client", return_value=pg):
        response = _invoke({
            "httpMethod": "POST",
            "body": json.dumps({
                "user_id": "u1", "news_id": "n1",
                "interaction_type": "bogus",
            }),
        })
    assert response["statusCode"] == 400


def test_handler_whitespace_user_id_returns_400():
    """user_id of '   ' is treated as missing."""
    pg = MagicMock()
    with patch.object(h, "PgVectorV2Client", return_value=pg):
        response = _invoke({
            "httpMethod": "POST",
            "body": json.dumps({
                "user_id": "   ", "news_id": "n1",
                "interaction_type": "click",
            }),
        })
    assert response["statusCode"] == 400


# =============================================================================
# lambda_handler — happy paths
# =============================================================================


def test_handler_minimal_valid_request_records_interaction():
    pg = MagicMock()
    pg.get_user_profile.return_value = None  # no existing profile
    with patch.object(h, "PgVectorV2Client", return_value=pg), \
         patch.object(h, "MemoryManager") as mm_cls:
        response = _invoke({
            "httpMethod": "POST",
            "body": json.dumps({
                "user_id": "u1", "news_id": "n1",
                "interaction_type": "click",
            }),
        })
    assert response["statusCode"] == 200
    body = json.loads(response["body"])
    assert body["ok"] is True
    assert body["profile_created"] is False  # no full mbti → no create
    pg.record_interaction.assert_called_once()
    mm_cls.assert_not_called()


def test_handler_with_full_mbti_creates_profile():
    """First call with INTJ → profile_created=True."""
    pg = MagicMock()
    pg.get_user_profile.return_value = None  # didn't exist before
    mm = MagicMock()
    with patch.object(h, "PgVectorV2Client", return_value=pg), \
         patch.object(h, "MemoryManager", return_value=mm):
        response = _invoke({
            "httpMethod": "POST",
            "body": json.dumps({
                "user_id": "u1", "news_id": "n1",
                "interaction_type": "click", "mbti_type": "INTJ",
            }),
        })
    assert response["statusCode"] == 200
    body = json.loads(response["body"])
    assert body["profile_created"] is True
    mm.get_or_create_profile.assert_called_once_with("u1", "INTJ")
    pg.record_interaction.assert_called_once()


def test_handler_with_full_mbti_existing_profile_not_created():
    """Profile already exists → profile_created=False."""
    pg = MagicMock()
    pg.get_user_profile.return_value = {"user_id": "u1", "mbti_type": "INTJ"}
    mm = MagicMock()
    with patch.object(h, "PgVectorV2Client", return_value=pg), \
         patch.object(h, "MemoryManager", return_value=mm):
        response = _invoke({
            "httpMethod": "POST",
            "body": json.dumps({
                "user_id": "u1", "news_id": "n1",
                "interaction_type": "click", "mbti_type": "INTJ",
            }),
        })
    body = json.loads(response["body"])
    assert body["profile_created"] is False
    mm.get_or_create_profile.assert_called_once()  # still called (idempotent)


def test_handler_2char_mbti_records_but_no_profile_create():
    """user_id + 2-char mbti → record interaction with group, no
    profile-create."""
    pg = MagicMock()
    with patch.object(h, "PgVectorV2Client", return_value=pg), \
         patch.object(h, "MemoryManager") as mm_cls:
        response = _invoke({
            "httpMethod": "POST",
            "body": json.dumps({
                "user_id": "u1", "news_id": "n1",
                "interaction_type": "click", "mbti_type": "NT",
            }),
        })
    assert response["statusCode"] == 200
    mm_cls.assert_not_called()
    call = pg.record_interaction.call_args
    assert call.kwargs["mbti_type"] == "NT"


def test_handler_records_optional_fields():
    pg = MagicMock()
    pg.get_user_profile.return_value = None
    with patch.object(h, "PgVectorV2Client", return_value=pg), \
         patch.object(h, "MemoryManager"):
        _invoke({
            "httpMethod": "POST",
            "body": json.dumps({
                "user_id": "u1", "news_id": "n1",
                "interaction_type": "dwell", "mbti_type": "INTJ",
                "dwell_ms": 5000, "scroll_pct": 80,
                "rating": 4, "reaction_type": "like",
            }),
        })
    call = pg.record_interaction.call_args
    assert call.kwargs["dwell_ms"] == 5000
    assert call.kwargs["scroll_pct"] == 80
    assert call.kwargs["rating"] == 4
    assert call.kwargs["reaction_type"] == "like"
    assert call.kwargs["interaction_type"] == "dwell"


def test_handler_clamps_invalid_optional_fields_to_none():
    """Invalid optional values pass through as None — they don't 400
    the request because the interaction itself is still valid."""
    pg = MagicMock()
    with patch.object(h, "PgVectorV2Client", return_value=pg):
        response = _invoke({
            "httpMethod": "POST",
            "body": json.dumps({
                "user_id": "u1", "news_id": "n1",
                "interaction_type": "click",
                "scroll_pct": 999,    # > 100
                "rating": 0,          # < 1
                "dwell_ms": "abc",    # not int
            }),
        })
    assert response["statusCode"] == 200
    call = pg.record_interaction.call_args
    assert call.kwargs["scroll_pct"] is None
    assert call.kwargs["rating"] is None
    assert call.kwargs["dwell_ms"] is None


def test_handler_skip_event_no_mbti():
    """skip events legitimately have no mbti — schema allows NULL."""
    pg = MagicMock()
    with patch.object(h, "PgVectorV2Client", return_value=pg):
        response = _invoke({
            "httpMethod": "POST",
            "body": json.dumps({
                "user_id": "u1", "news_id": "n1",
                "interaction_type": "skip",
            }),
        })
    assert response["statusCode"] == 200
    call = pg.record_interaction.call_args
    assert call.kwargs["mbti_type"] is None
