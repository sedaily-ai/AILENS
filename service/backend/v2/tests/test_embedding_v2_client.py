"""Unit tests for ``EmbeddingV2Client``.

Bedrock is always mocked (cost + reproducibility); these tests are
unit-only — there is no integration tier because the live Bedrock path
is exercised end-to-end by ``test_core1_collector`` integration tests.

Run from ``backend/``::

    python3 -m pytest v2/tests/test_embedding_v2_client.py -v
"""
from __future__ import annotations

import json
import logging
from io import BytesIO
from unittest.mock import MagicMock, patch

import pytest

logger = logging.getLogger(__name__)

from v2.clients.embedding_v2_client import (
    EmbeddingError,
    EmbeddingV2Client,
    _average_vectors,
    _split_into_chunks,
    _split_paragraph,
)

_DIM = 1024


def _bedrock_response(embedding: list[float], token_count: int = 42) -> dict:
    """Build a synthetic Bedrock invoke_model response payload."""
    body = json.dumps(
        {"embedding": embedding, "inputTextTokenCount": token_count}
    ).encode("utf-8")
    return {"body": BytesIO(body)}


def _make_client_with_mock_bedrock(
    endpoint_url: str | None = None,
) -> tuple[EmbeddingV2Client, MagicMock]:
    """Build an EmbeddingV2Client whose underlying boto3 client is a MagicMock."""
    with patch(
        "v2.clients.embedding_v2_client.boto3.client"
    ) as mock_factory:
        mock_bedrock = MagicMock()
        mock_factory.return_value = mock_bedrock
        client = EmbeddingV2Client(endpoint_url=endpoint_url)
    return client, mock_bedrock


# =============================================================================
# Constructor — endpoint_url wiring
# =============================================================================


def test_init_no_endpoint_url_omits_kwarg() -> None:
    """When endpoint_url is None, boto3.client is called WITHOUT the kwarg
    so it falls back to the default Bedrock public endpoint."""
    with patch("v2.clients.embedding_v2_client.boto3.client") as factory:
        EmbeddingV2Client(endpoint_url=None)
    kwargs = factory.call_args.kwargs
    assert "endpoint_url" not in kwargs


def test_init_empty_endpoint_url_omits_kwarg() -> None:
    """Empty string treated as None — env-var fallback friendliness."""
    with patch("v2.clients.embedding_v2_client.boto3.client") as factory:
        client = EmbeddingV2Client(endpoint_url="")
    kwargs = factory.call_args.kwargs
    assert "endpoint_url" not in kwargs
    assert client.endpoint_url is None


def test_init_with_endpoint_url_passes_through() -> None:
    url = "https://vpce-xxx.bedrock-runtime.us-east-1.vpce.amazonaws.com"
    with patch("v2.clients.embedding_v2_client.boto3.client") as factory:
        client = EmbeddingV2Client(endpoint_url=url)
    kwargs = factory.call_args.kwargs
    assert kwargs["endpoint_url"] == url
    assert client.endpoint_url == url


def test_init_uses_default_model_id_and_dimension() -> None:
    """Defaults match config.constants — no v2-specific fork of model pin."""
    with patch("v2.clients.embedding_v2_client.boto3.client"):
        client = EmbeddingV2Client()
    assert client.model_id == "amazon.titan-embed-text-v2:0"
    assert client.dimension == 1024


# =============================================================================
# embed_text — empty / whitespace
# =============================================================================


def test_embed_text_empty_returns_zero_vector() -> None:
    client, _ = _make_client_with_mock_bedrock()
    assert client.embed_text("") == [0.0] * _DIM


def test_embed_text_whitespace_returns_zero_vector() -> None:
    client, mock = _make_client_with_mock_bedrock()
    assert client.embed_text("   \n\t  ") == [0.0] * _DIM
    mock.invoke_model.assert_not_called()


# =============================================================================
# embed_text — short (single Bedrock call)
# =============================================================================


def test_embed_text_short_calls_bedrock_once() -> None:
    client, mock = _make_client_with_mock_bedrock()
    expected_vec = [0.1] * _DIM
    mock.invoke_model.return_value = _bedrock_response(expected_vec)
    # No throttling exception class on the magic mock — guard against
    # the except clause picking up a MagicMock attribute by setting it.
    mock.exceptions.ThrottlingException = type(
        "ThrottlingException", (Exception,), {}
    )

    result = client.embed_text("삼성전자 1분기 실적")
    assert result == expected_vec
    mock.invoke_model.assert_called_once()
    body = json.loads(mock.invoke_model.call_args.kwargs["body"])
    assert body["inputText"] == "삼성전자 1분기 실적"
    assert body["dimensions"] == _DIM


def test_embed_text_strips_input_before_bedrock_call() -> None:
    client, mock = _make_client_with_mock_bedrock()
    mock.invoke_model.return_value = _bedrock_response([0.5] * _DIM)
    mock.exceptions.ThrottlingException = type(
        "ThrottlingException", (Exception,), {}
    )

    client.embed_text("  hello  ")
    body = json.loads(mock.invoke_model.call_args.kwargs["body"])
    assert body["inputText"] == "hello"


# =============================================================================
# embed_text — long (chunked + averaged)
# =============================================================================


def test_embed_text_long_chunks_and_averages() -> None:
    client, mock = _make_client_with_mock_bedrock()
    mock.exceptions.ThrottlingException = type(
        "ThrottlingException", (Exception,), {}
    )
    # Each chunk returns a different deterministic vector so we can
    # verify the result is the L2-normalized mean.
    call_returns = [
        _bedrock_response([1.0] * _DIM),
        _bedrock_response([3.0] * _DIM),
    ]
    mock.invoke_model.side_effect = call_returns

    long_text = ("가" * 5000 + "\n\n" + "나" * 5000)  # 2 chunks expected
    result = client.embed_text(long_text)

    assert mock.invoke_model.call_count >= 2
    # mean of [1, 1, ..., 1] and [3, 3, ..., 3] = [2, ...], then L2-normalize
    # → all components equal 2 / (sqrt(1024) * 2) = 1/sqrt(1024)
    expected_component = 1.0 / (1024**0.5)
    for v in result:
        assert abs(v - expected_component) < 1e-9


# =============================================================================
# embed_text — Bedrock failure raises EmbeddingError (post-9d4d657)
# =============================================================================


def test_embed_text_bedrock_failure_raises_embedding_error() -> None:
    """Pre-9d4d657 (2026-04-29) this returned a zero vector on Bedrock
    failures. That silently poisoned pgvector rows because callers
    couldn't tell a real all-zero embedding from a failed call. The
    fix made embed_text raise EmbeddingError instead, with v2 callers
    (Collector, backfill, Selector) all updated to handle it. Empty/
    whitespace input still returns zero vector deliberately (see the
    two tests above) — that's a sentinel for callers, not a failure
    sign."""
    client, mock = _make_client_with_mock_bedrock()
    mock.exceptions.ThrottlingException = type(
        "ThrottlingException", (Exception,), {}
    )
    mock.invoke_model.side_effect = RuntimeError("Bedrock down")

    with pytest.raises(EmbeddingError):
        client.embed_text("normal length text")


# =============================================================================
# embed_batch
# =============================================================================


def test_embed_batch_iterates() -> None:
    client, mock = _make_client_with_mock_bedrock()
    mock.exceptions.ThrottlingException = type(
        "ThrottlingException", (Exception,), {}
    )
    mock.invoke_model.side_effect = [
        _bedrock_response([0.1] * _DIM),
        _bedrock_response([0.2] * _DIM),
        _bedrock_response([0.3] * _DIM),
    ]
    results = client.embed_batch(["a", "b", "c"])
    assert len(results) == 3
    assert results[0][0] == 0.1
    assert results[1][0] == 0.2
    assert results[2][0] == 0.3


# =============================================================================
# Aliases (parity with v1 spec)
# =============================================================================


def test_get_embedding_is_alias_of_embed_text() -> None:
    client, mock = _make_client_with_mock_bedrock()
    mock.exceptions.ThrottlingException = type(
        "ThrottlingException", (Exception,), {}
    )
    # side_effect gives a fresh BytesIO per call — using return_value would
    # exhaust the body on the first call and return a zero vector on the
    # second.
    mock.invoke_model.side_effect = [
        _bedrock_response([0.7] * _DIM),
        _bedrock_response([0.7] * _DIM),
    ]
    assert client.get_embedding("x") == client.embed_text("x")


def test_get_embeddings_batch_is_alias_of_embed_batch() -> None:
    client, mock = _make_client_with_mock_bedrock()
    mock.exceptions.ThrottlingException = type(
        "ThrottlingException", (Exception,), {}
    )
    mock.invoke_model.side_effect = [
        _bedrock_response([0.4] * _DIM),
        _bedrock_response([0.4] * _DIM),
    ]
    assert client.get_embeddings_batch(["a"]) == client.embed_batch(["a"])


# =============================================================================
# _call_bedrock specific behavior
# =============================================================================


def test_call_bedrock_missing_embedding_in_response_raises() -> None:
    client, mock = _make_client_with_mock_bedrock()
    mock.exceptions.ThrottlingException = type(
        "ThrottlingException", (Exception,), {}
    )
    mock.invoke_model.return_value = {
        "body": BytesIO(json.dumps({"otherField": "x"}).encode("utf-8"))
    }
    with pytest.raises(EmbeddingError, match="No embedding in response"):
        client._call_bedrock("hi")


def test_call_bedrock_throttling_raises_embedding_error() -> None:
    client, mock = _make_client_with_mock_bedrock()

    class ThrottlingException(Exception):
        pass

    mock.exceptions.ThrottlingException = ThrottlingException
    mock.invoke_model.side_effect = ThrottlingException("rate limit")
    with pytest.raises(EmbeddingError, match="Throttled"):
        client._call_bedrock("hi")


# =============================================================================
# Helper: _split_into_chunks
# =============================================================================


def test_split_into_chunks_short_text_single_chunk() -> None:
    assert _split_into_chunks("short", 100) == ["short"]


def test_split_into_chunks_paragraphs_merge_when_under_limit() -> None:
    text = "p1\n\np2\n\np3"
    chunks = _split_into_chunks(text, 100)
    assert chunks == ["p1\n\np2\n\np3"]


def test_split_into_chunks_paragraphs_split_when_over_limit() -> None:
    text = "a" * 50 + "\n\n" + "b" * 50 + "\n\n" + "c" * 50
    chunks = _split_into_chunks(text, 60)
    # First chunk holds "a"*50; second holds "b"*50; third holds "c"*50
    assert len(chunks) == 3


def test_split_paragraph_falls_back_to_hard_split_without_sentences() -> None:
    chunks = _split_paragraph("a" * 100, 30)
    assert all(len(c) <= 30 for c in chunks)
    assert "".join(chunks) == "a" * 100


# =============================================================================
# Helper: _average_vectors
# =============================================================================


def test_average_vectors_normalizes_to_unit_magnitude() -> None:
    vecs = [[1.0, 0.0], [0.0, 1.0]]
    result = _average_vectors(vecs)
    magnitude = (result[0] ** 2 + result[1] ** 2) ** 0.5
    assert abs(magnitude - 1.0) < 1e-9


def test_average_vectors_empty_input_returns_empty() -> None:
    assert _average_vectors([]) == []


def test_average_vectors_single_vector_normalizes_in_place() -> None:
    vecs = [[3.0, 4.0]]
    result = _average_vectors(vecs)
    # 3-4-5 right triangle → unit vec [0.6, 0.8]
    assert abs(result[0] - 0.6) < 1e-9
    assert abs(result[1] - 0.8) < 1e-9
