"""Unit tests for v2.clients.selector_service.

No live Bedrock. All Nova calls go through MagicMock to keep this fast
and deterministic. Live integration is exercised by the Selector
Lambda's own integration tests (test_core1_5_selector.py).
"""
from __future__ import annotations

import asyncio
import json
from typing import Dict
from unittest.mock import MagicMock

import pytest

from v2.clients.selector_service import (
    DEFAULT_SCORE,
    SCORING_BATCH_SIZE,
    build_user_message,
    composite_score,
    make_default_scores,
    make_nova_client,
    parse_nova_response,
    score_articles,
    score_one_batch,
)


# =============================================================================
# make_default_scores
# =============================================================================


def test_make_default_scores_has_all_5_keys() -> None:
    scores = make_default_scores()
    assert set(scores.keys()) == {
        "nt_score",
        "nf_score",
        "st_score",
        "sf_score",
        "quality",
    }
    assert all(v == DEFAULT_SCORE for v in scores.values())


def test_make_default_scores_returns_independent_copies() -> None:
    a = make_default_scores()
    a["nt_score"] = 99.0
    b = make_default_scores()
    assert b["nt_score"] == DEFAULT_SCORE  # unaffected by mutation of a


# =============================================================================
# composite_score — 0.7 * mbti + 0.3 * quality (matches v1 step1_select)
# =============================================================================


def test_composite_score_matches_v1_formula() -> None:
    scores = {"nt_score": 9.0, "quality": 6.0}
    # 9 * 0.7 + 6 * 0.3 = 6.3 + 1.8 = 8.1
    assert composite_score(scores, "NT") == pytest.approx(8.1)


def test_composite_score_case_insensitive() -> None:
    scores = {"sf_score": 8.0, "quality": 7.0}
    upper = composite_score(scores, "SF")
    lower = composite_score(scores, "sf")
    assert upper == lower == pytest.approx(8.0 * 0.7 + 7.0 * 0.3)


def test_composite_score_falls_back_to_default_on_missing_keys() -> None:
    # No mbti score, no quality — both fall back to 5.0 → 5.0 composite
    assert composite_score({}, "NT") == pytest.approx(DEFAULT_SCORE)


def test_composite_score_per_mbti_keys() -> None:
    scores = {
        "nt_score": 10.0, "nf_score": 1.0, "st_score": 5.0, "sf_score": 3.0,
        "quality": 7.0,
    }
    # quality=7 contributes 2.1 to all
    assert composite_score(scores, "NT") == pytest.approx(10.0 * 0.7 + 2.1)
    assert composite_score(scores, "NF") == pytest.approx(1.0 * 0.7 + 2.1)
    assert composite_score(scores, "ST") == pytest.approx(5.0 * 0.7 + 2.1)
    assert composite_score(scores, "SF") == pytest.approx(3.0 * 0.7 + 2.1)


# =============================================================================
# build_user_message
# =============================================================================


def test_build_user_message_includes_article_count() -> None:
    sys_prompt = "SYS"
    articles = [
        {"news_id": "n1", "title": "t1", "category": "경제",
         "content_preview": "p1"},
        {"news_id": "n2", "title": "t2", "category": "IT_과학",
         "content_preview": "p2"},
    ]
    msg = build_user_message(sys_prompt, articles)
    assert "## 후보 기사 (2건)" in msg


def test_build_user_message_embeds_news_id_and_category() -> None:
    articles = [
        {"news_id": "ABC123", "title": "삼성전자 실적", "category": "경제",
         "content_preview": "preview text"},
    ]
    msg = build_user_message("SYS", articles)
    assert "[ABC123]" in msg
    assert "(경제)" in msg
    assert "삼성전자 실적" in msg
    assert "preview text" in msg


def test_build_user_message_handles_missing_optional_fields() -> None:
    articles = [{"news_id": "n1", "title": "t1"}]  # no category, no preview
    msg = build_user_message("SYS", articles)
    assert "(기타)" in msg  # default category
    # No exception raised; preview slot stays empty before "..."
    assert "n1" in msg


def test_build_user_message_emits_strict_json_directive() -> None:
    msg = build_user_message("SYS", [{"news_id": "n", "title": "t"}])
    assert "JSON 배열만 출력하세요" in msg


# =============================================================================
# parse_nova_response
# =============================================================================


def test_parse_nova_response_extracts_array_from_clean_json() -> None:
    text = (
        '[{"news_id": "n1", "nt_score": 8, "nf_score": 3, '
        '"st_score": 7, "sf_score": 4, "quality": 8}]'
    )
    parsed = parse_nova_response(text, ["n1"])
    assert "n1" in parsed
    assert parsed["n1"]["nt_score"] == 8.0
    assert parsed["n1"]["quality"] == 8.0


def test_parse_nova_response_handles_markdown_fence() -> None:
    text = '```json\n[{"news_id":"n1","nt_score":9}]\n```'
    parsed = parse_nova_response(text, ["n1"])
    assert "n1" in parsed
    assert parsed["n1"]["nt_score"] == 9.0
    # other keys fall back to default
    assert parsed["n1"]["quality"] == DEFAULT_SCORE


def test_parse_nova_response_handles_prose_wrapper() -> None:
    text = (
        "Here are the scores:\n"
        '[{"news_id":"n1","nt_score":7,"nf_score":4,"st_score":6,'
        '"sf_score":5,"quality":7,"reasoning":"..."}]\n'
        "Done."
    )
    parsed = parse_nova_response(text, ["n1"])
    assert parsed["n1"]["nt_score"] == 7.0


def test_parse_nova_response_drops_unexpected_news_ids() -> None:
    text = (
        '[{"news_id":"n1","nt_score":8},{"news_id":"hallucinated","nt_score":1}]'
    )
    parsed = parse_nova_response(text, ["n1"])
    assert "n1" in parsed
    assert "hallucinated" not in parsed


def test_parse_nova_response_returns_empty_on_no_array() -> None:
    assert parse_nova_response("just prose, no JSON", ["n1"]) == {}
    assert parse_nova_response("", ["n1"]) == {}
    assert parse_nova_response("{}", ["n1"]) == {}  # object, not array


def test_parse_nova_response_returns_empty_on_malformed_json() -> None:
    text = '[{"news_id": "n1", "nt_score": 8'  # truncated
    assert parse_nova_response(text, ["n1"]) == {}


def test_parse_nova_response_coerces_numeric_strings() -> None:
    text = '[{"news_id":"n1","nt_score":"8.5","quality":"7"}]'
    parsed = parse_nova_response(text, ["n1"])
    assert parsed["n1"]["nt_score"] == 8.5
    assert parsed["n1"]["quality"] == 7.0


def test_parse_nova_response_skips_invalid_score_values() -> None:
    text = '[{"news_id":"n1","nt_score":"abc","quality":7}]'
    parsed = parse_nova_response(text, ["n1"])
    # nt_score falls back to default; quality parses cleanly
    assert parsed["n1"]["nt_score"] == DEFAULT_SCORE
    assert parsed["n1"]["quality"] == 7.0


def test_parse_nova_response_drops_non_dict_entries() -> None:
    """Mid-array non-dict entries get filtered. Nova is documented to
    return only object entries, but defensive parsing matters."""
    # All-object array with one entry missing required keys —
    # the regex matches this shape (starts {, ends })
    text = (
        '[{"news_id":"n1","nt_score":8},'
        '{"news_id":"","invalid":true},'
        '{"news_id":"n2","nt_score":7}]'
    )
    parsed = parse_nova_response(text, ["n1", "n2"])
    assert "n1" in parsed
    assert "n2" in parsed
    assert parsed["n1"]["nt_score"] == 8.0
    assert parsed["n2"]["nt_score"] == 7.0
    # Empty news_id falls outside expected_news_ids → silently dropped
    assert "" not in parsed
    assert len(parsed) == 2


# =============================================================================
# make_nova_client
# =============================================================================


def test_make_nova_client_falls_back_to_public_when_endpoint_url_none() -> None:
    """Smoke test: client constructs without raising when endpoint_url=None."""
    client = make_nova_client(endpoint_url=None)
    assert client is not None


def test_make_nova_client_accepts_endpoint_url() -> None:
    client = make_nova_client(endpoint_url="https://vpce-test.amazonaws.com")
    assert client is not None


# =============================================================================
# score_one_batch — Bedrock Nova Lite mocked
# =============================================================================


class _MockBody:
    """Minimal Bedrock body stand-in. invoke_model returns response['body']
    which the caller .read()s once."""
    def __init__(self, data: bytes) -> None:
        self._data = data

    def read(self) -> bytes:
        return self._data


def _mock_nova_response_text(text: str) -> Dict:
    """Build a Bedrock-shaped response dict with the given text payload."""
    return {
        "body": _MockBody(json.dumps(
            {"output": {"message": {"content": [{"text": text}]}}}
        ).encode("utf-8"))
    }


def test_score_one_batch_empty_list_returns_empty_dict() -> None:
    result = asyncio.run(score_one_batch(MagicMock(), [], "SYS"))
    assert result == {}


def test_score_one_batch_overwrites_defaults_with_parsed_scores() -> None:
    nova = MagicMock()
    nova.invoke_model.return_value = _mock_nova_response_text(
        '[{"news_id":"n1","nt_score":9,"nf_score":3,"st_score":8,'
        '"sf_score":4,"quality":7}]'
    )
    articles = [
        {"news_id": "n1", "title": "t1", "category": "경제",
         "content_preview": "p1"},
    ]
    result = asyncio.run(score_one_batch(nova, articles, "SYS"))
    assert result["n1"]["nt_score"] == 9.0
    assert result["n1"]["quality"] == 7.0


def test_score_one_batch_keeps_defaults_for_unscored_articles() -> None:
    """Nova returns scores for n1 only; n2 falls through with defaults."""
    nova = MagicMock()
    nova.invoke_model.return_value = _mock_nova_response_text(
        '[{"news_id":"n1","nt_score":9}]'
    )
    articles = [
        {"news_id": "n1", "title": "t1", "category": "경제",
         "content_preview": "p1"},
        {"news_id": "n2", "title": "t2", "category": "경제",
         "content_preview": "p2"},
    ]
    result = asyncio.run(score_one_batch(nova, articles, "SYS"))
    assert result["n1"]["nt_score"] == 9.0
    assert result["n2"] == make_default_scores()


def test_score_one_batch_default_to_mid_on_bedrock_exception() -> None:
    """Throttling / timeout / any exception → every article gets defaults."""
    nova = MagicMock()
    nova.invoke_model.side_effect = RuntimeError("ThrottlingException")
    articles = [
        {"news_id": "n1", "title": "t1", "category": "경제",
         "content_preview": "p1"},
    ]
    result = asyncio.run(score_one_batch(nova, articles, "SYS"))
    assert result["n1"] == make_default_scores()


def test_score_one_batch_default_to_mid_on_no_array() -> None:
    nova = MagicMock()
    nova.invoke_model.return_value = _mock_nova_response_text(
        "Sorry, I can't process that."
    )
    articles = [
        {"news_id": "n1", "title": "t1", "category": "경제",
         "content_preview": "p1"},
    ]
    result = asyncio.run(score_one_batch(nova, articles, "SYS"))
    assert result["n1"] == make_default_scores()


def test_score_one_batch_passes_correct_model_id() -> None:
    nova = MagicMock()
    nova.invoke_model.return_value = _mock_nova_response_text("[]")
    articles = [
        {"news_id": "n1", "title": "t1", "category": "경제",
         "content_preview": "p1"},
    ]
    asyncio.run(score_one_batch(nova, articles, "SYS"))
    call_kwargs = nova.invoke_model.call_args.kwargs
    assert call_kwargs["modelId"] == "amazon.nova-lite-v1:0"
    assert call_kwargs["contentType"] == "application/json"


def test_score_one_batch_body_includes_temperature_and_max_tokens() -> None:
    nova = MagicMock()
    nova.invoke_model.return_value = _mock_nova_response_text("[]")
    articles = [
        {"news_id": "n1", "title": "t1", "category": "경제",
         "content_preview": "p1"},
    ]
    asyncio.run(score_one_batch(nova, articles, "SYS"))
    body = json.loads(nova.invoke_model.call_args.kwargs["body"])
    assert body["inferenceConfig"]["temperature"] == 0.1
    assert body["inferenceConfig"]["maxTokens"] == 3072


# =============================================================================
# score_articles — chunking + concurrency
# =============================================================================


def test_score_articles_empty_input_returns_empty() -> None:
    result = asyncio.run(score_articles(MagicMock(), [], "SYS"))
    assert result == {}


def test_score_articles_chunks_into_batches_of_20() -> None:
    """Confirm SCORING_BATCH_SIZE drives chunking."""
    nova = MagicMock()
    nova.invoke_model.return_value = _mock_nova_response_text("[]")
    # 25 articles → 2 batches (20 + 5)
    articles = [
        {"news_id": f"n{i}", "title": f"t{i}", "category": "경제",
         "content_preview": "p"}
        for i in range(25)
    ]
    asyncio.run(score_articles(nova, articles, "SYS"))
    assert nova.invoke_model.call_count == 2


def test_score_articles_merges_batch_results() -> None:
    """Each batch can return scores for its own articles; merged dict
    contains all of them with correct values."""
    call_count = {"n": 0}

    def _side_effect(**kwargs):
        call_count["n"] += 1
        # Return distinct scores per call so we can verify merge
        if call_count["n"] == 1:
            return _mock_nova_response_text(
                '[{"news_id":"n0","nt_score":9}]'
            )
        return _mock_nova_response_text(
            '[{"news_id":"n20","nt_score":8}]'
        )

    nova = MagicMock()
    nova.invoke_model.side_effect = _side_effect
    articles = [
        {"news_id": f"n{i}", "title": f"t{i}", "category": "경제",
         "content_preview": "p"}
        for i in range(25)
    ]
    result = asyncio.run(score_articles(nova, articles, "SYS"))
    # All 25 articles in result (defaults for unscored)
    assert len(result) == 25
    assert result["n0"]["nt_score"] == 9.0
    assert result["n20"]["nt_score"] == 8.0
    # n1-n19 from batch 1 fall back to defaults
    assert result["n1"]["nt_score"] == DEFAULT_SCORE


def test_score_articles_single_batch_when_under_size() -> None:
    nova = MagicMock()
    nova.invoke_model.return_value = _mock_nova_response_text("[]")
    articles = [
        {"news_id": f"n{i}", "title": f"t{i}", "category": "경제",
         "content_preview": "p"}
        for i in range(SCORING_BATCH_SIZE)  # exactly 20
    ]
    asyncio.run(score_articles(nova, articles, "SYS"))
    assert nova.invoke_model.call_count == 1
