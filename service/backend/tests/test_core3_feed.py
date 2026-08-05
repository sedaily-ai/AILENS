"""Unit tests for v2.handlers.core3_feed.

Strategy: mock PgVectorV2Client so handler's request/response shape and
parameter validation are tested without DB. Live integration is exercised
post-deploy via curl.
"""
from __future__ import annotations

import json
from datetime import date, datetime, timezone
from unittest.mock import MagicMock, patch

import pytest

from handlers import core3_feed
from handlers.core3_feed import (
    BODY_PREVIEW_CHARS,
    DEFAULT_LIMIT,
    MAX_LIMIT,
    _build_item_from_cold,
    _isoformat_or_none,
    _parse_limit,
    _parse_since_date,
    _validate_mbti,
    lambda_handler,
)


# =============================================================================
# Pure helpers
# =============================================================================


def test_validate_mbti_accepts_2char() -> None:
    assert _validate_mbti("NT") == "NT"
    assert _validate_mbti("NF") == "NF"
    assert _validate_mbti("ST") == "ST"
    assert _validate_mbti("SF") == "SF"


def test_validate_mbti_accepts_4char_full_mbti() -> None:
    """Frontend may pass the user's stored 4-char mbti_type directly."""
    assert _validate_mbti("INTJ") == "NT"
    assert _validate_mbti("ENFP") == "NF"
    assert _validate_mbti("ISTP") == "ST"
    assert _validate_mbti("ESFJ") == "SF"


def test_validate_mbti_lowercases_and_strips() -> None:
    assert _validate_mbti("  nt  ") == "NT"
    assert _validate_mbti("intj") == "NT"


def test_validate_mbti_returns_none_on_invalid() -> None:
    assert _validate_mbti(None) is None
    assert _validate_mbti("") is None
    assert _validate_mbti("XX") is None
    assert _validate_mbti("INVALID") is None
    assert _validate_mbti("ABCDE") is None  # 5-char


def test_parse_limit_default_when_missing() -> None:
    assert _parse_limit(None) == DEFAULT_LIMIT
    assert _parse_limit("") == DEFAULT_LIMIT


def test_parse_limit_default_on_invalid() -> None:
    assert _parse_limit("abc") == DEFAULT_LIMIT
    assert _parse_limit("0") == DEFAULT_LIMIT  # zero treated as fallback
    assert _parse_limit("-5") == DEFAULT_LIMIT


def test_parse_limit_caps_at_max() -> None:
    assert _parse_limit("9999") == MAX_LIMIT
    assert _parse_limit(str(MAX_LIMIT + 1)) == MAX_LIMIT


def test_parse_limit_passes_through_in_range() -> None:
    assert _parse_limit("5") == 5
    assert _parse_limit(str(MAX_LIMIT)) == MAX_LIMIT


def test_parse_since_date_iso() -> None:
    assert _parse_since_date("2026-04-20") == date(2026, 4, 20)


def test_parse_since_date_invalid_returns_none() -> None:
    assert _parse_since_date(None) is None
    assert _parse_since_date("") is None
    assert _parse_since_date("not a date") is None
    assert _parse_since_date("2026/04/20") is None  # wrong separator


def test_isoformat_or_none_handles_date() -> None:
    assert _isoformat_or_none(date(2026, 4, 27)) == "2026-04-27"


def test_isoformat_or_none_handles_datetime() -> None:
    dt = datetime(2026, 4, 27, 1, 30, tzinfo=timezone.utc)
    assert _isoformat_or_none(dt).startswith("2026-04-27T01:30")


def test_isoformat_or_none_passthrough_string() -> None:
    """If pg client gives back an already-stringified value, don't crash."""
    assert _isoformat_or_none("2026-04-27T00:00:00+09:00") == "2026-04-27T00:00:00+09:00"


def test_isoformat_or_none_handles_none() -> None:
    assert _isoformat_or_none(None) is None


def test_build_item_from_cold_truncates_body() -> None:
    long_body = "한" * 500
    row = {
        "news_id": "n1",
        "category": "경제",
        "published_at": date(2026, 4, 26),
        "selection_date": date(2026, 4, 27),
        "transformed_at": datetime(2026, 4, 27, 1, 0, tzinfo=timezone.utc),
        "version_title": "T",
        "version_body": long_body,
    }
    item = _build_item_from_cold(row)
    assert len(item["body_preview"]) == BODY_PREVIEW_CHARS
    assert item["body_preview"] == "한" * BODY_PREVIEW_CHARS


def test_build_item_from_cold_omits_internal_fields() -> None:
    """composite_score and version_metadata must NOT leak to the public payload."""
    row = {
        "news_id": "n1",
        "category": "경제",
        "published_at": None,
        "selection_date": date(2026, 4, 27),
        "composite_score": 8.7,  # internal — must not appear
        "transformed_at": None,
        "version_title": "T",
        "version_body": "B",
        "version_metadata": {"key_points": ["secret"]},  # also internal
    }
    item = _build_item_from_cold(row)
    assert "composite_score" not in item
    assert "version_metadata" not in item
    assert "key_points" not in item


def test_build_item_from_cold_exposes_article_metadata_fields() -> None:
    """B3-a + Path 2: press/sub_title/url/byline come from article_metadata,
    image_url comes from version_metadata (Transform-time extraction).
    All surfaced at top level so the frontend card renders without a
    second fetch."""
    row = {
        "news_id": "n1",
        "category": "경제",
        "published_at": None,
        "selection_date": None,
        "transformed_at": None,
        "version_title": "T",
        "version_body": "B",
        "article_metadata": {
            "press": "서울경제",
            "sub_title": "원본 부제",
            "url": "https://www.sedaily.com/...",
            "author_name": "홍길동 기자",
            "author_email": "hong@sedaily.com",
            "content_preview": "원본 200자",
        },
        "version_metadata": {
            "image_url": "https://wimg.sedaily.com/news/cms/.../P1.jpg",
            "subtitle": "NT 부제",
            "key_points": ["p1"],
            "closing_line": "마무리",
        },
    }
    item = _build_item_from_cold(row)
    assert item["press"] == "서울경제"
    assert item["sub_title"] == "원본 부제"
    assert item["url"] == "https://www.sedaily.com/..."
    assert item["byline"] == "홍길동 기자"
    assert item["image_url"] == "https://wimg.sedaily.com/news/cms/.../P1.jpg"
    # author_email and content_preview should NOT leak (not in contract)
    assert "author_email" not in item
    assert "content_preview" not in item


def test_build_item_from_cold_image_url_none_when_pre_path2_version() -> None:
    """Versions written before Path 2 (image extraction at Transform)
    have no image_url in version_metadata. Frontend renders the
    category-based ImagePlaceholder for those rows."""
    row = {
        "news_id": "n1",
        "category": "경제",
        "published_at": None,
        "selection_date": None,
        "transformed_at": None,
        "version_title": "T",
        "version_body": "B",
        "article_metadata": {
            "press": "서울경제",
        },
        "version_metadata": {
            # no image_url key — pre-Path-2 version
            "subtitle": "NT 부제",
        },
    }
    item = _build_item_from_cold(row)
    assert item["image_url"] is None
    assert item["press"] == "서울경제"  # other fields still work


def test_build_item_from_cold_handles_missing_article_metadata() -> None:
    """Defensive: article_metadata may be None or missing keys.
    All metadata-derived fields fall to None, which the frontend
    renders with placeholders."""
    # Case 1: article_metadata is None
    row1 = {
        "news_id": "n1",
        "category": "경제",
        "published_at": None,
        "selection_date": None,
        "transformed_at": None,
        "version_title": "T",
        "version_body": "B",
        "article_metadata": None,
    }
    item1 = _build_item_from_cold(row1)
    assert item1["press"] is None
    assert item1["sub_title"] is None
    assert item1["url"] is None
    assert item1["byline"] is None

    # Case 2: article_metadata is empty dict
    row2 = {**row1, "article_metadata": {}}
    item2 = _build_item_from_cold(row2)
    assert item2["press"] is None
    assert item2["byline"] is None


def test_build_item_from_cold_handles_short_body() -> None:
    row = {
        "news_id": "n1",
        "category": "경제",
        "published_at": None,
        "selection_date": None,
        "transformed_at": None,
        "version_title": "T",
        "version_body": "short body",
    }
    item = _build_item_from_cold(row)
    assert item["body_preview"] == "short body"  # not padded


def test_build_item_from_cold_handles_none_body() -> None:
    """Defensive against unexpected NULL body in DB (shouldn't happen but)."""
    row = {
        "news_id": "n1",
        "category": "경제",
        "published_at": None,
        "selection_date": None,
        "transformed_at": None,
        "version_title": "T",
        "version_body": None,
    }
    item = _build_item_from_cold(row)
    assert item["body_preview"] == ""


# =============================================================================
# lambda_handler — end-to-end with mocks
# =============================================================================


def _invoke(event: dict) -> dict:
    """Run the @handler_decorator-wrapped sync handler."""
    return lambda_handler(event, MagicMock(name="lambda_context"))


def test_handler_options_request_short_circuits() -> None:
    response = _invoke({"httpMethod": "OPTIONS"})
    assert response["statusCode"] == 200
    assert "Access-Control-Allow-Origin" in response["headers"]


def test_handler_missing_mbti_returns_400() -> None:
    pg = MagicMock()
    with patch.object(core3_feed, "PgVectorV2Client", return_value=pg):
        response = _invoke({"httpMethod": "GET"})
    assert response["statusCode"] == 400
    body = json.loads(response["body"])
    # error_response shape: {'error': 'message string', 'code': '...', ...}
    assert "mbti" in body.get("error", "").lower()
    pg.get_feed.assert_not_called()


def test_handler_invalid_mbti_returns_400() -> None:
    pg = MagicMock()
    with patch.object(core3_feed, "PgVectorV2Client", return_value=pg):
        response = _invoke({
            "httpMethod": "GET",
            "queryStringParameters": {"mbti": "XX"},
        })
    assert response["statusCode"] == 400
    pg.get_feed.assert_not_called()


def test_handler_valid_mbti_returns_200_with_items() -> None:
    pg = MagicMock()
    pg.get_feed.return_value = [
        {
            "news_id": "n1",
            "mbti_type": "NT",
            "selection_date": date(2026, 4, 27),
            "composite_score": 8.5,
            "transformed_at": datetime(2026, 4, 27, 1, 0, tzinfo=timezone.utc),
            "category": "경제",
            "published_at": date(2026, 4, 26),
            "article_metadata": {"press": "서울경제"},
            "version_title": "NT 톤 제목",
            "version_body": "NT 본문 " * 50,  # > 200 chars
            "version_metadata": {"key_points": ["p1"]},
        },
        {
            "news_id": "n2",
            "mbti_type": "NT",
            "selection_date": date(2026, 4, 27),
            "composite_score": 7.8,
            "transformed_at": datetime(2026, 4, 27, 1, 0, tzinfo=timezone.utc),
            "category": "사회",
            "published_at": date(2026, 4, 26),
            "article_metadata": {},
            "version_title": "NT 제목 2",
            "version_body": "짧은 본문",
            "version_metadata": {},
        },
    ]
    with patch.object(core3_feed, "PgVectorV2Client", return_value=pg):
        response = _invoke({
            "httpMethod": "GET",
            "queryStringParameters": {"mbti": "NT"},
        })
    assert response["statusCode"] == 200
    body = json.loads(response["body"])
    assert body["mbti_type"] == "NT"
    assert body["count"] == 2
    assert len(body["items"]) == 2
    assert body["items"][0]["news_id"] == "n1"
    assert body["items"][0]["title"] == "NT 톤 제목"
    assert len(body["items"][0]["body_preview"]) == BODY_PREVIEW_CHARS
    assert "composite_score" not in body["items"][0]


def test_handler_4char_mbti_normalized_to_2char() -> None:
    """User passes 'INTJ' (their stored mbti_type) → handler reduces to 'NT'."""
    pg = MagicMock()
    pg.get_feed.return_value = []
    with patch.object(core3_feed, "PgVectorV2Client", return_value=pg):
        response = _invoke({
            "httpMethod": "GET",
            "queryStringParameters": {"mbti": "INTJ"},
        })
    body = json.loads(response["body"])
    assert body["mbti_type"] == "NT"
    pg.get_feed.assert_called_once()
    # Verify pg.get_feed received NT, not INTJ
    call_args = pg.get_feed.call_args
    assert call_args.args[0] == "NT" or call_args.kwargs.get("mbti_type") == "NT"


def test_handler_limit_clamps_to_max() -> None:
    pg = MagicMock()
    pg.get_feed.return_value = []
    with patch.object(core3_feed, "PgVectorV2Client", return_value=pg):
        _invoke({
            "httpMethod": "GET",
            "queryStringParameters": {"mbti": "NT", "limit": "9999"},
        })
    call_args = pg.get_feed.call_args
    assert call_args.kwargs.get("limit") == MAX_LIMIT


def test_handler_limit_default_when_missing() -> None:
    pg = MagicMock()
    pg.get_feed.return_value = []
    with patch.object(core3_feed, "PgVectorV2Client", return_value=pg):
        _invoke({
            "httpMethod": "GET",
            "queryStringParameters": {"mbti": "NT"},
        })
    assert pg.get_feed.call_args.kwargs.get("limit") == DEFAULT_LIMIT


def test_handler_since_date_passed_through() -> None:
    pg = MagicMock()
    pg.get_feed.return_value = []
    with patch.object(core3_feed, "PgVectorV2Client", return_value=pg):
        _invoke({
            "httpMethod": "GET",
            "queryStringParameters": {"mbti": "NT", "since": "2026-04-20"},
        })
    assert pg.get_feed.call_args.kwargs.get("since_date") == date(2026, 4, 20)


def test_handler_invalid_since_date_passes_none() -> None:
    """Bad since= falls through to client default (silent — feed should still
    work even with a malformed date)."""
    pg = MagicMock()
    pg.get_feed.return_value = []
    with patch.object(core3_feed, "PgVectorV2Client", return_value=pg):
        _invoke({
            "httpMethod": "GET",
            "queryStringParameters": {"mbti": "NT", "since": "not-a-date"},
        })
    assert pg.get_feed.call_args.kwargs.get("since_date") is None


# ── Personalization (Round 5-C) ─────────────────────────────────────────────


def _make_personalization_mocks(
    *,
    has_profile: bool = False,
    embedding=None,
    ranked_articles=None,
):
    """Build a tuple of mocks for the personalization stack.

    Returns (pg_mock, memory_mock, broker_mock, agent_mock). Each is
    pre-configured for the typical 'happy path' — tests override
    specific return values as needed.
    """
    from core3.context_broker import UserContext

    pg = MagicMock()
    pg.get_feed.return_value = []
    pg.find_feed_candidates.return_value = []

    memory = MagicMock()

    broker = MagicMock()
    broker.get_user_context.return_value = UserContext(
        user_id="user-abc",
        mbti_type="INTJ" if has_profile else None,
        mbti_group="NT" if has_profile else None,
        category_weights={},
        preference_embedding=embedding,
        recent_news_ids=[],
        has_profile=has_profile,
    )

    agent = MagicMock()
    agent.recommend.return_value = ranked_articles or []

    return pg, memory, broker, agent


def test_handler_no_user_id_uses_anonymous_path() -> None:
    """Without ``user_id`` the handler bypasses MemoryManager entirely
    and just calls pg.get_feed (Phase 2.5 behavior preserved)."""
    pg = MagicMock()
    pg.get_feed.return_value = []
    with patch.object(core3_feed, "PgVectorV2Client", return_value=pg), \
         patch.object(core3_feed, "MemoryManager") as mm_cls, \
         patch.object(core3_feed, "ContextBroker") as cb_cls, \
         patch.object(core3_feed, "RecommendAgent") as ra_cls:
        response = _invoke({
            "httpMethod": "GET",
            "queryStringParameters": {"mbti": "NT"},  # no user_id
        })
    assert response["statusCode"] == 200
    pg.get_feed.assert_called_once()
    # Personalization stack never instantiated
    mm_cls.assert_not_called()
    cb_cls.assert_not_called()
    ra_cls.assert_not_called()


@pytest.mark.xfail(
    strict=True,
    reason=(
        "Core 3 개인화 읽기 경로가 2026-05-13 부터 꺼져 있다 "
        "(core3_feed.py 의 'V1 simplification' 주석). lambda_handler 는 user_id 와 "
        "무관하게 _serve_anonymous 만 호출하므로 이 테스트가 검증하는 경로에 "
        "도달하지 않는다. 사용자 확인(2026-07-29): 잠정 조치이며 개인화는 나중에 "
        "다시 켜진다. strict=True 라 재활성화되면 XPASS 가 실패로 보고된다 — "
        "그때 이 marker 를 떼면 된다."
    ),
)
def test_handler_user_id_no_full_mbti_skips_profile_create() -> None:
    """user_id + 2-char mbti only → no get_or_create_profile call."""
    pg, mm, cb, ag = _make_personalization_mocks(has_profile=False)
    with patch.object(core3_feed, "PgVectorV2Client", return_value=pg), \
         patch.object(core3_feed, "MemoryManager", return_value=mm), \
         patch.object(core3_feed, "ContextBroker", return_value=cb), \
         patch.object(core3_feed, "RecommendAgent", return_value=ag):
        _invoke({
            "httpMethod": "GET",
            "queryStringParameters": {"mbti": "NT", "user_id": "user-abc"},
        })
    mm.get_or_create_profile.assert_not_called()
    cb.get_user_context.assert_called_once()
    ag.recommend.assert_called_once()


@pytest.mark.xfail(
    strict=True,
    reason=(
        "Core 3 개인화 읽기 경로가 2026-05-13 부터 꺼져 있다 "
        "(core3_feed.py 의 'V1 simplification' 주석). lambda_handler 는 user_id 와 "
        "무관하게 _serve_anonymous 만 호출하므로 이 테스트가 검증하는 경로에 "
        "도달하지 않는다. 사용자 확인(2026-07-29): 잠정 조치이며 개인화는 나중에 "
        "다시 켜진다. strict=True 라 재활성화되면 XPASS 가 실패로 보고된다 — "
        "그때 이 marker 를 떼면 된다."
    ),
)
def test_handler_user_id_with_full_mbti_creates_profile() -> None:
    """user_id + 4-char mbti → get_or_create_profile called once."""
    pg, mm, cb, ag = _make_personalization_mocks(has_profile=True)
    with patch.object(core3_feed, "PgVectorV2Client", return_value=pg), \
         patch.object(core3_feed, "MemoryManager", return_value=mm), \
         patch.object(core3_feed, "ContextBroker", return_value=cb), \
         patch.object(core3_feed, "RecommendAgent", return_value=ag):
        _invoke({
            "httpMethod": "GET",
            "queryStringParameters": {"mbti": "INTJ", "user_id": "user-abc"},
        })
    mm.get_or_create_profile.assert_called_once_with("user-abc", "INTJ")


@pytest.mark.xfail(
    strict=True,
    reason=(
        "Core 3 개인화 읽기 경로가 2026-05-13 부터 꺼져 있다 "
        "(core3_feed.py 의 'V1 simplification' 주석). lambda_handler 는 user_id 와 "
        "무관하게 _serve_anonymous 만 호출하므로 이 테스트가 검증하는 경로에 "
        "도달하지 않는다. 사용자 확인(2026-07-29): 잠정 조치이며 개인화는 나중에 "
        "다시 켜진다. strict=True 라 재활성화되면 XPASS 가 실패로 보고된다 — "
        "그때 이 marker 를 떼면 된다."
    ),
)
def test_handler_personalized_response_uses_ranked_articles() -> None:
    """Warm path: agent returns ranked articles, handler converts via
    _build_item_from_warm and includes them in items[]."""
    from core3.recommend_agent import RankedArticle
    ranked = [
        RankedArticle(
            news_id="n1",
            mbti_type="NT",
            score=0.9,
            payload={
                "news_id": "n1",
                "mbti_type": "NT",
                "title": "warm title",
                "body": "warm body content",
                "category": "economy",
                "published_at": None,
                "created_at": None,
                "version_metadata": {"image_url": "https://x/y.jpg"},
                "article_metadata": {"press": "서울경제", "url": "https://x"},
                "distance": 0.1,
            },
            path="warm",
        ),
    ]
    pg, mm, cb, ag = _make_personalization_mocks(
        has_profile=True, embedding=[0.1] * 1024, ranked_articles=ranked,
    )
    with patch.object(core3_feed, "PgVectorV2Client", return_value=pg), \
         patch.object(core3_feed, "MemoryManager", return_value=mm), \
         patch.object(core3_feed, "ContextBroker", return_value=cb), \
         patch.object(core3_feed, "RecommendAgent", return_value=ag):
        response = _invoke({
            "httpMethod": "GET",
            "queryStringParameters": {"mbti": "INTJ", "user_id": "user-abc"},
        })
    assert response["statusCode"] == 200
    body = json.loads(response["body"])
    assert body["count"] == 1
    item = body["items"][0]
    assert item["news_id"] == "n1"
    assert item["title"] == "warm title"
    assert item["body_preview"] == "warm body content"  # <200 chars, no trunc
    assert item["press"] == "서울경제"
    assert item["url"] == "https://x"
    assert item["image_url"] == "https://x/y.jpg"
    # Warm-path-specific: selection_date is None
    assert item["selection_date"] is None


@pytest.mark.xfail(
    strict=True,
    reason=(
        "Core 3 개인화 읽기 경로가 2026-05-13 부터 꺼져 있다 "
        "(core3_feed.py 의 'V1 simplification' 주석). lambda_handler 는 user_id 와 "
        "무관하게 _serve_anonymous 만 호출하므로 이 테스트가 검증하는 경로에 "
        "도달하지 않는다. 사용자 확인(2026-07-29): 잠정 조치이며 개인화는 나중에 "
        "다시 켜진다. strict=True 라 재활성화되면 XPASS 가 실패로 보고된다 — "
        "그때 이 marker 를 떼면 된다."
    ),
)
def test_handler_cold_path_via_agent_preserves_get_feed_shape() -> None:
    """When agent returns RankedArticle with path='cold', the payload
    is a get_feed row and _build_item_from_cold handles it."""
    from datetime import date
    from core3.recommend_agent import RankedArticle
    ranked = [
        RankedArticle(
            news_id="n2",
            mbti_type="NT",
            score=0.0,
            payload={
                "news_id": "n2",
                "mbti_type": "NT",
                "selection_date": date(2026, 4, 27),
                "transformed_at": None,
                "category": "tech",
                "published_at": None,
                "version_title": "cold title",
                "version_body": "cold body",
                "article_metadata": {"press": "test press"},
                "version_metadata": {},
            },
            path="cold",
        ),
    ]
    pg, mm, cb, ag = _make_personalization_mocks(
        has_profile=False, ranked_articles=ranked,
    )
    with patch.object(core3_feed, "PgVectorV2Client", return_value=pg), \
         patch.object(core3_feed, "MemoryManager", return_value=mm), \
         patch.object(core3_feed, "ContextBroker", return_value=cb), \
         patch.object(core3_feed, "RecommendAgent", return_value=ag):
        response = _invoke({
            "httpMethod": "GET",
            "queryStringParameters": {"mbti": "NT", "user_id": "user-abc"},
        })
    body = json.loads(response["body"])
    item = body["items"][0]
    assert item["title"] == "cold title"
    assert item["body_preview"] == "cold body"
    assert item["press"] == "test press"
    assert item["selection_date"] == "2026-04-27"


def test_handler_user_id_whitespace_treated_as_anonymous() -> None:
    """Trim before checking — '   ' is no user_id."""
    pg = MagicMock()
    pg.get_feed.return_value = []
    with patch.object(core3_feed, "PgVectorV2Client", return_value=pg), \
         patch.object(core3_feed, "MemoryManager") as mm_cls:
        _invoke({
            "httpMethod": "GET",
            "queryStringParameters": {"mbti": "NT", "user_id": "   "},
        })
    pg.get_feed.assert_called_once()
    mm_cls.assert_not_called()


def test_handler_empty_feed_returns_200_with_empty_items() -> None:
    """No selected+transformed rows yet → 200 + count=0 (NOT 404)."""
    pg = MagicMock()
    pg.get_feed.return_value = []
    with patch.object(core3_feed, "PgVectorV2Client", return_value=pg):
        response = _invoke({
            "httpMethod": "GET",
            "queryStringParameters": {"mbti": "NT"},
        })
    assert response["statusCode"] == 200
    body = json.loads(response["body"])
    assert body["count"] == 0
    assert body["items"] == []


def test_handler_response_body_is_json_serializable() -> None:
    """Datetime objects in pg client output must be ISO-stringified before json.dumps."""
    pg = MagicMock()
    pg.get_feed.return_value = [
        {
            "news_id": "n1",
            "selection_date": date(2026, 4, 27),
            "transformed_at": datetime(2026, 4, 27, 1, 0, tzinfo=timezone.utc),
            "published_at": datetime(2026, 4, 26, 13, 0, tzinfo=timezone.utc),
            "category": "경제",
            "version_title": "T",
            "version_body": "B",
        }
    ]
    with patch.object(core3_feed, "PgVectorV2Client", return_value=pg):
        response = _invoke({
            "httpMethod": "GET",
            "queryStringParameters": {"mbti": "NT"},
        })
    # If date/datetime objects leaked, json.loads(response["body"]) would have
    # raised in error or shown them as Python repr. This assertion validates
    # success_response's json.dumps round-trips successfully.
    body = json.loads(response["body"])
    assert body["items"][0]["selection_date"] == "2026-04-27"
    assert "T" in body["items"][0]["transformed_at"]  # ISO format includes 'T'
