"""Unit tests for v2.handlers.core3_article."""
from __future__ import annotations

import json
from datetime import date, datetime, timezone
from unittest.mock import MagicMock, patch

import pytest

from v2.handlers import core3_article
from v2.handlers.core3_article import (
    _build_article_response,
    _extract_news_id,
    _isoformat_or_none,
    _validate_mbti,
    lambda_handler,
)


# =============================================================================
# _extract_news_id
# =============================================================================


def test_extract_news_id_from_pathparameters() -> None:
    """API Gateway HTTP API v2 — pathParameters is the canonical source."""
    event = {"pathParameters": {"news_id": "2KBA6I5K9J"}}
    assert _extract_news_id(event) == "2KBA6I5K9J"


def test_extract_news_id_strips_whitespace() -> None:
    event = {"pathParameters": {"news_id": "  abc  "}}
    assert _extract_news_id(event) == "abc"


def test_extract_news_id_from_raw_path_fallback() -> None:
    """Direct invocation (no API Gateway) — parse from event.path."""
    event = {"path": "/api/v2/article/2KBA6I5K9J"}
    assert _extract_news_id(event) == "2KBA6I5K9J"


def test_extract_news_id_from_request_context_path() -> None:
    """HTTP API v2 also exposes path under requestContext.http.path."""
    event = {
        "requestContext": {"http": {"path": "/api/v2/article/2KBA6I5K9J"}}
    }
    assert _extract_news_id(event) == "2KBA6I5K9J"


def test_extract_news_id_handles_trailing_slash() -> None:
    event = {"path": "/api/v2/article/2KBA6I5K9J/"}
    assert _extract_news_id(event) == "2KBA6I5K9J"


def test_extract_news_id_returns_none_when_missing() -> None:
    assert _extract_news_id({}) is None
    assert _extract_news_id({"pathParameters": None}) is None
    assert _extract_news_id({"pathParameters": {}}) is None
    assert _extract_news_id({"path": "/api/v2/feed"}) is None  # different path


def test_extract_news_id_returns_none_for_empty_string() -> None:
    event = {"pathParameters": {"news_id": "   "}}
    assert _extract_news_id(event) is None


# =============================================================================
# _validate_mbti (same contract as feed handler — verify independence)
# =============================================================================


def test_validate_mbti_2char_and_4char() -> None:
    assert _validate_mbti("NT") == "NT"
    assert _validate_mbti("INTJ") == "NT"
    assert _validate_mbti("ENFP") == "NF"


def test_validate_mbti_lowercase_normalized() -> None:
    assert _validate_mbti("nt") == "NT"
    assert _validate_mbti("intj") == "NT"


def test_validate_mbti_invalid_returns_none() -> None:
    assert _validate_mbti(None) is None
    assert _validate_mbti("") is None
    assert _validate_mbti("XX") is None
    assert _validate_mbti("INVALID") is None


# =============================================================================
# _isoformat_or_none
# =============================================================================


def test_isoformat_or_none_handles_date_datetime_string_none() -> None:
    assert _isoformat_or_none(None) is None
    assert _isoformat_or_none(date(2026, 4, 27)) == "2026-04-27"
    dt = datetime(2026, 4, 27, 1, 30, tzinfo=timezone.utc)
    assert _isoformat_or_none(dt).startswith("2026-04-27T01:30")
    assert _isoformat_or_none("already a string") == "already a string"


# =============================================================================
# _build_article_response
# =============================================================================


def test_build_article_response_full_shape() -> None:
    pub_at = datetime(2026, 4, 26, 13, 0, tzinfo=timezone.utc)
    created = datetime(2026, 4, 27, 2, 0, tzinfo=timezone.utc)
    row = {
        "news_id": "n1",
        "original_title": "원본 제목",
        "category": "사회",
        "published_at": pub_at,
        "article_metadata": {
            "press": "서울경제",
            "url": "https://sedaily.com/x",
            "author_name": "홍길동 기자",
            "sub_title": "원본 부제",
        },
        "mbti_type": "NT",
        "version_title": "NT 톤 제목",
        "version_body": "NT 본문 전체...",
        "version_metadata": {
            "subtitle": "NT 부제",
            "key_points": ["p1", "p2"],
            "closing_line": "NT 마무리",
        },
        "version_created_at": created,
    }
    response = _build_article_response(row)
    assert response["news_id"] == "n1"
    assert response["mbti_type"] == "NT"
    assert response["category"] == "사회"
    assert response["published_at"] == pub_at.isoformat()
    assert response["press"] == "서울경제"
    assert response["url"] == "https://sedaily.com/x"
    assert response["byline"] == "홍길동 기자"
    assert response["original_title"] == "원본 제목"
    assert response["original_sub_title"] == "원본 부제"
    assert response["version"]["title"] == "NT 톤 제목"
    assert response["version"]["body"] == "NT 본문 전체..."
    assert response["version"]["subtitle"] == "NT 부제"
    assert response["version"]["key_points"] == ["p1", "p2"]
    assert response["version"]["closing_line"] == "NT 마무리"
    assert response["transformed_at"] == created.isoformat()


def test_build_article_response_handles_missing_metadata_keys() -> None:
    """Some article_metadata fields (press, url) may be absent — should
    return None, not crash."""
    row = {
        "news_id": "n1",
        "original_title": "T",
        "category": "경제",
        "published_at": None,
        "article_metadata": {},  # no press, no url
        "mbti_type": "NT",
        "version_title": "VT",
        "version_body": "VB",
        "version_metadata": {},  # no subtitle, no key_points, no closing
        "version_created_at": None,
    }
    response = _build_article_response(row)
    assert response["press"] is None
    assert response["url"] is None
    assert response["version"]["subtitle"] == ""
    assert response["version"]["key_points"] == []
    assert response["version"]["closing_line"] == ""


def test_build_article_response_handles_none_metadata() -> None:
    """Defensive: row.metadata could be None (DB column NULL)."""
    row = {
        "news_id": "n1",
        "original_title": "T",
        "category": "경제",
        "published_at": None,
        "article_metadata": None,
        "mbti_type": "NT",
        "version_title": "VT",
        "version_body": "VB",
        "version_metadata": None,
        "version_created_at": None,
    }
    response = _build_article_response(row)
    assert response["press"] is None
    assert response["version"]["key_points"] == []


def test_build_article_response_omits_internal_fields() -> None:
    """composite_score and other internal fields must not leak."""
    row = {
        "news_id": "n1",
        "original_title": "T",
        "category": "경제",
        "published_at": None,
        "article_metadata": {"press": "X"},
        "mbti_type": "NT",
        "version_title": "VT",
        "version_body": "VB",
        "version_metadata": {},
        "version_created_at": None,
        # internal fields that should NEVER leak:
        "composite_score": 9.9,
        "embedding": [0.1] * 1024,
    }
    response = _build_article_response(row)
    assert "composite_score" not in response
    assert "embedding" not in response


# =============================================================================
# lambda_handler — end-to-end with mocks
# =============================================================================


def _invoke(event: dict) -> dict:
    return lambda_handler(event, MagicMock(name="lambda_context"))


def test_handler_options_short_circuits() -> None:
    response = _invoke({"httpMethod": "OPTIONS"})
    assert response["statusCode"] == 200


def test_handler_missing_news_id_returns_400() -> None:
    pg = MagicMock()
    with patch.object(core3_article, "PgVectorV2Client", return_value=pg):
        response = _invoke({
            "httpMethod": "GET",
            "queryStringParameters": {"mbti": "NT"},
        })
    assert response["statusCode"] == 400
    body = json.loads(response["body"])
    assert "news_id" in body.get("error", "").lower()
    pg.get_article_with_version.assert_not_called()


def test_handler_missing_mbti_returns_400() -> None:
    pg = MagicMock()
    with patch.object(core3_article, "PgVectorV2Client", return_value=pg):
        response = _invoke({
            "httpMethod": "GET",
            "pathParameters": {"news_id": "n1"},
        })
    assert response["statusCode"] == 400
    body = json.loads(response["body"])
    assert "mbti" in body.get("error", "").lower()
    pg.get_article_with_version.assert_not_called()


def test_handler_invalid_mbti_returns_400() -> None:
    pg = MagicMock()
    with patch.object(core3_article, "PgVectorV2Client", return_value=pg):
        response = _invoke({
            "httpMethod": "GET",
            "pathParameters": {"news_id": "n1"},
            "queryStringParameters": {"mbti": "XX"},
        })
    assert response["statusCode"] == 400
    pg.get_article_with_version.assert_not_called()


def test_handler_article_not_found_returns_404() -> None:
    """Article doesn't exist OR no version for this MBTI → 404."""
    pg = MagicMock()
    pg.get_article_with_version.return_value = None
    with patch.object(core3_article, "PgVectorV2Client", return_value=pg):
        response = _invoke({
            "httpMethod": "GET",
            "pathParameters": {"news_id": "missing"},
            "queryStringParameters": {"mbti": "NT"},
        })
    assert response["statusCode"] == 404
    body = json.loads(response["body"])
    assert "missing" in body.get("error", "")
    assert "NT" in body.get("error", "")


def test_handler_happy_path_returns_full_article() -> None:
    pg = MagicMock()
    pub_at = datetime(2026, 4, 26, 13, 0, tzinfo=timezone.utc)
    created = datetime(2026, 4, 27, 2, 0, tzinfo=timezone.utc)
    pg.get_article_with_version.return_value = {
        "news_id": "n1",
        "original_title": "원본 제목",
        "category": "사회",
        "published_at": pub_at,
        "article_metadata": {"press": "서울경제", "url": "https://x"},
        "mbti_type": "NT",
        "version_title": "NT 톤 제목",
        "version_body": "NT 본문 전체",
        "version_metadata": {
            "subtitle": "NT 부제",
            "key_points": ["a", "b"],
            "closing_line": "NT 마무리",
        },
        "version_created_at": created,
    }
    with patch.object(core3_article, "PgVectorV2Client", return_value=pg):
        response = _invoke({
            "httpMethod": "GET",
            "pathParameters": {"news_id": "n1"},
            "queryStringParameters": {"mbti": "NT"},
        })
    assert response["statusCode"] == 200
    body = json.loads(response["body"])
    assert body["news_id"] == "n1"
    assert body["mbti_type"] == "NT"
    assert body["original_title"] == "원본 제목"
    assert body["press"] == "서울경제"
    assert body["url"] == "https://x"
    assert body["version"]["title"] == "NT 톤 제목"
    assert body["version"]["body"] == "NT 본문 전체"
    assert body["version"]["key_points"] == ["a", "b"]


def test_handler_4char_mbti_normalized() -> None:
    pg = MagicMock()
    pg.get_article_with_version.return_value = None
    with patch.object(core3_article, "PgVectorV2Client", return_value=pg):
        _invoke({
            "httpMethod": "GET",
            "pathParameters": {"news_id": "n1"},
            "queryStringParameters": {"mbti": "INTJ"},
        })
    # Verify pg received "NT", not "INTJ"
    call_args = pg.get_article_with_version.call_args
    assert call_args.args[1] == "NT" or call_args.kwargs.get("mbti_type") == "NT"


def test_handler_user_id_accepted_but_unused() -> None:
    pg = MagicMock()
    pg.get_article_with_version.return_value = None
    with patch.object(core3_article, "PgVectorV2Client", return_value=pg):
        response = _invoke({
            "httpMethod": "GET",
            "pathParameters": {"news_id": "n1"},
            "queryStringParameters": {"mbti": "NT", "user_id": "user-abc"},
        })
    # 404 from None return, but request itself was accepted (not 400)
    assert response["statusCode"] == 404


def test_handler_response_json_serializable() -> None:
    """datetime fields ISO-stringified, no leaking Python repr."""
    pg = MagicMock()
    created = datetime(2026, 4, 27, 2, 0, tzinfo=timezone.utc)
    pg.get_article_with_version.return_value = {
        "news_id": "n1",
        "original_title": "T",
        "category": "경제",
        "published_at": date(2026, 4, 26),
        "article_metadata": {},
        "mbti_type": "NT",
        "version_title": "VT",
        "version_body": "VB",
        "version_metadata": {},
        "version_created_at": created,
    }
    with patch.object(core3_article, "PgVectorV2Client", return_value=pg):
        response = _invoke({
            "httpMethod": "GET",
            "pathParameters": {"news_id": "n1"},
            "queryStringParameters": {"mbti": "NT"},
        })
    body = json.loads(response["body"])
    assert body["published_at"] == "2026-04-26"
    assert "T" in body["transformed_at"]


def test_handler_path_fallback_when_no_pathparams() -> None:
    """Direct invocation: no pathParameters, news_id parsed from event.path."""
    pg = MagicMock()
    pg.get_article_with_version.return_value = None
    with patch.object(core3_article, "PgVectorV2Client", return_value=pg):
        response = _invoke({
            "httpMethod": "GET",
            "path": "/api/v2/article/parsed-from-path-id",
            "queryStringParameters": {"mbti": "NT"},
        })
    # Reaches pg call (not 400 missing news_id)
    pg.get_article_with_version.assert_called_once()
    call_args = pg.get_article_with_version.call_args
    assert call_args.args[0] == "parsed-from-path-id"


# =============================================================================
# Round 4 — ?include_all_mbti opt-in
# =============================================================================


def test_parse_bool_truthy_values() -> None:
    """Liberal acceptance: 1/true/yes/on case-insensitive."""
    from v2.handlers.core3_article import _parse_bool
    for v in ("1", "true", "True", "TRUE", "yes", "YES", "on", "ON", " true "):
        assert _parse_bool(v) is True, f"failed for {v!r}"


def test_parse_bool_falsy_values() -> None:
    from v2.handlers.core3_article import _parse_bool
    for v in (None, "", "0", "false", "False", "no", "off", "anything-else"):
        assert _parse_bool(v) is False, f"failed for {v!r}"


def test_handler_default_response_no_all_versions_field() -> None:
    """Without ?include_all_mbti, response must NOT include all_versions
    field (default code path unchanged — mobile/cache compat)."""
    pg = MagicMock()
    created = datetime(2026, 4, 27, 2, 0, tzinfo=timezone.utc)
    pg.get_article_with_version.return_value = {
        "news_id": "n1",
        "original_title": "T",
        "category": "사회",
        "published_at": date(2026, 4, 26),
        "article_metadata": {"press": "P", "url": "https://x"},
        "mbti_type": "NT",
        "version_title": "VT",
        "version_body": "VB",
        "version_metadata": {"subtitle": "VS", "key_points": ["a"]},
        "version_created_at": created,
    }
    with patch.object(core3_article, "PgVectorV2Client", return_value=pg):
        response = _invoke({
            "httpMethod": "GET",
            "pathParameters": {"news_id": "n1"},
            "queryStringParameters": {"mbti": "NT"},
        })
    assert response["statusCode"] == 200
    body = json.loads(response["body"])
    assert "all_versions" not in body
    pg.get_article_versions.assert_not_called()


def test_handler_include_all_mbti_returns_all_versions() -> None:
    """With ?include_all_mbti=true, all_versions field present with all 4
    MBTI entries (when available)."""
    pg = MagicMock()
    created = datetime(2026, 4, 27, 2, 0, tzinfo=timezone.utc)
    pg.get_article_with_version.return_value = {
        "news_id": "n1",
        "original_title": "T",
        "category": "사회",
        "published_at": date(2026, 4, 26),
        "article_metadata": {"press": "P", "url": "https://x"},
        "mbti_type": "NT",
        "version_title": "NT-T",
        "version_body": "NT-B",
        "version_metadata": {"subtitle": "NT-S", "key_points": ["a"]},
        "version_created_at": created,
    }
    pg.get_article_versions.return_value = {
        "NT": {"title": "NT-T", "body": "NT-B", "metadata": {"subtitle": "NT-S", "key_points": ["a"], "closing_line": "NT-C"}},
        "NF": {"title": "NF-T", "body": "NF-B", "metadata": {"subtitle": "NF-S", "key_points": ["b"], "closing_line": "NF-C"}},
        "ST": {"title": "ST-T", "body": "ST-B", "metadata": {"subtitle": "ST-S", "key_points": ["c"], "closing_line": "ST-C"}},
        "SF": {"title": "SF-T", "body": "SF-B", "metadata": {"subtitle": "SF-S", "key_points": ["d"], "closing_line": "SF-C"}},
    }
    with patch.object(core3_article, "PgVectorV2Client", return_value=pg):
        response = _invoke({
            "httpMethod": "GET",
            "pathParameters": {"news_id": "n1"},
            "queryStringParameters": {"mbti": "NT", "include_all_mbti": "true"},
        })
    assert response["statusCode"] == 200
    body = json.loads(response["body"])
    assert "all_versions" in body
    assert set(body["all_versions"].keys()) == {"NT", "NF", "ST", "SF"}
    assert body["all_versions"]["NF"]["title"] == "NF-T"
    assert body["all_versions"]["NF"]["body"] == "NF-B"
    assert body["all_versions"]["NF"]["closing_line"] == "NF-C"
    # Primary `version` field still present and matches `mbti` query
    assert body["version"]["title"] == "NT-T"
    pg.get_article_versions.assert_called_once_with("n1")


def test_handler_include_all_mbti_partial_transform() -> None:
    """When article was only selected for 2 MBTIs, all_versions has 2 entries.
    Frontend treats <4 as fallback case (existing 4-parallel policy)."""
    pg = MagicMock()
    created = datetime(2026, 4, 27, 2, 0, tzinfo=timezone.utc)
    pg.get_article_with_version.return_value = {
        "news_id": "n1",
        "original_title": "T",
        "category": "사회",
        "published_at": date(2026, 4, 26),
        "article_metadata": {},
        "mbti_type": "NT",
        "version_title": "NT-T",
        "version_body": "NT-B",
        "version_metadata": {"subtitle": "NT-S"},
        "version_created_at": created,
    }
    pg.get_article_versions.return_value = {
        "NT": {"title": "NT-T", "body": "NT-B", "metadata": {"subtitle": "NT-S", "key_points": [], "closing_line": ""}},
        "NF": {"title": "NF-T", "body": "NF-B", "metadata": {"subtitle": "NF-S", "key_points": [], "closing_line": ""}},
    }
    with patch.object(core3_article, "PgVectorV2Client", return_value=pg):
        response = _invoke({
            "httpMethod": "GET",
            "pathParameters": {"news_id": "n1"},
            "queryStringParameters": {"mbti": "NT", "include_all_mbti": "true"},
        })
    assert response["statusCode"] == 200
    body = json.loads(response["body"])
    assert set(body["all_versions"].keys()) == {"NT", "NF"}


def test_handler_include_all_mbti_falsy_does_not_query() -> None:
    """include_all_mbti=false / 0 / no / empty → no second query."""
    pg = MagicMock()
    created = datetime(2026, 4, 27, 2, 0, tzinfo=timezone.utc)
    pg.get_article_with_version.return_value = {
        "news_id": "n1",
        "original_title": "T",
        "category": "사회",
        "published_at": date(2026, 4, 26),
        "article_metadata": {},
        "mbti_type": "NT",
        "version_title": "VT",
        "version_body": "VB",
        "version_metadata": {},
        "version_created_at": created,
    }
    for val in ("false", "0", "no", ""):
        pg.reset_mock()
        pg.get_article_with_version.return_value = pg.get_article_with_version.return_value
        with patch.object(core3_article, "PgVectorV2Client", return_value=pg):
            response = _invoke({
                "httpMethod": "GET",
                "pathParameters": {"news_id": "n1"},
                "queryStringParameters": {"mbti": "NT", "include_all_mbti": val},
            })
        assert response["statusCode"] == 200
        body = json.loads(response["body"])
        assert "all_versions" not in body, f"failed for include_all_mbti={val!r}"
        pg.get_article_versions.assert_not_called()


def test_handler_404_short_circuits_before_all_versions_query() -> None:
    """404 path doesn't call get_article_versions even with include_all_mbti=true.
    Saves a wasted RDS query when article doesn't exist for this MBTI."""
    pg = MagicMock()
    pg.get_article_with_version.return_value = None
    with patch.object(core3_article, "PgVectorV2Client", return_value=pg):
        response = _invoke({
            "httpMethod": "GET",
            "pathParameters": {"news_id": "missing"},
            "queryStringParameters": {"mbti": "NT", "include_all_mbti": "true"},
        })
    assert response["statusCode"] == 404
    pg.get_article_versions.assert_not_called()
