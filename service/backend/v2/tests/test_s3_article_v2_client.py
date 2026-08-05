"""Unit + integration tests for ``S3ArticleV2Client``.

* **Unit**        — MagicMock-backed boto3 client; no AWS calls. Default run.
* **Integration** — ``@pytest.mark.integration``; requires
  ``S3_ARTICLE_BODY_V2_BUCKET`` env var. Auto-skipped when absent.

Run from ``backend/``::

    python3 -m pytest v2/tests/test_s3_article_v2_client.py -v -m 'not integration'
    python3 -m pytest v2/tests/test_s3_article_v2_client.py -v -m integration
"""
from __future__ import annotations

import json
import logging
import os
from typing import Any, Dict
from unittest.mock import MagicMock

import pytest
from botocore.exceptions import ClientError

from v2.clients.s3_article_v2_client import S3ArticleV2Client

logger = logging.getLogger(__name__)


# =============================================================================
# Unit — init & no-op mode
# =============================================================================

def _clear_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("S3_ARTICLE_BODY_V2_BUCKET", raising=False)


def test_init_disabled_when_bucket_env_empty(monkeypatch: pytest.MonkeyPatch) -> None:
    _clear_env(monkeypatch)
    c = S3ArticleV2Client()
    assert c._enabled is False
    assert c._client is None


def test_init_disabled_when_bucket_arg_empty_string(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _clear_env(monkeypatch)
    # Explicit empty string — should still be no-op (matches PgVectorV2Client parity).
    c = S3ArticleV2Client(bucket_name="")
    assert c._enabled is False


def test_init_reads_env(monkeypatch: pytest.MonkeyPatch) -> None:
    _clear_env(monkeypatch)
    monkeypatch.setenv("S3_ARTICLE_BODY_V2_BUCKET", "my-bucket")
    c = S3ArticleV2Client()
    assert c._enabled is True
    assert c.bucket_name == "my-bucket"
    assert c._client is not None


def test_init_arg_beats_env(monkeypatch: pytest.MonkeyPatch) -> None:
    _clear_env(monkeypatch)
    monkeypatch.setenv("S3_ARTICLE_BODY_V2_BUCKET", "env-bucket")
    c = S3ArticleV2Client(bucket_name="arg-bucket")
    assert c.bucket_name == "arg-bucket"


def test_init_normalizes_prefix_trailing_slash(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _clear_env(monkeypatch)
    c = S3ArticleV2Client(bucket_name="b", prefix="articles/")
    assert c.prefix == "articles"


# =============================================================================
# Unit — disabled mode no-op
# =============================================================================

def _disabled() -> S3ArticleV2Client:
    return S3ArticleV2Client(bucket_name="")


def test_disabled_put_returns_empty_string() -> None:
    assert _disabled().put_article_file("n", "f.json", {"t": "x"}) == ""


def test_disabled_get_returns_none() -> None:
    assert _disabled().get_article_file("n", "f.json") is None


def test_disabled_delete_returns_false() -> None:
    assert _disabled().delete_article_file("n", "f.json") is False


# =============================================================================
# Unit — SQL-equivalent behaviour with MagicMock boto3 client
# =============================================================================

def _enabled() -> S3ArticleV2Client:
    """Enabled client with a MagicMock boto3 S3 client preloaded."""
    c = S3ArticleV2Client(bucket_name="test-bucket")
    c._client = MagicMock()
    return c


def test_build_key_format() -> None:
    c = _enabled()
    assert c._build_key("NEWS1", "original.json") == "articles/NEWS1/original.json"


def test_build_uri_format() -> None:
    c = _enabled()
    assert (
        c.build_uri("NEWS1", "version_NT.json")
        == "s3://test-bucket/articles/NEWS1/version_NT.json"
    )


def test_put_article_file_calls_s3_put_object() -> None:
    c = _enabled()
    data: Dict[str, Any] = {"title": "삼성전자", "count": 3}
    uri = c.put_article_file("NEWS1", "original.json", data)

    assert uri == "s3://test-bucket/articles/NEWS1/original.json"
    c._client.put_object.assert_called_once()
    kwargs = c._client.put_object.call_args.kwargs
    assert kwargs["Bucket"] == "test-bucket"
    assert kwargs["Key"] == "articles/NEWS1/original.json"
    assert kwargs["ContentType"] == "application/json"
    # Korean preserved (ensure_ascii=False)
    assert "삼성전자".encode("utf-8") in kwargs["Body"]


def test_put_article_file_json_encodes_korean_without_escape() -> None:
    """Korean text is stored as UTF-8, not \\uXXXX escapes."""
    c = _enabled()
    c.put_article_file("N1", "f.json", {"title": "안녕하세요"})
    body = c._client.put_object.call_args.kwargs["Body"].decode("utf-8")
    assert "안녕하세요" in body
    assert "\\u" not in body


def test_put_article_file_handles_nonjson_types_via_default_str() -> None:
    """datetime etc. become strings rather than crashing json.dumps."""
    from datetime import datetime

    c = _enabled()
    c.put_article_file(
        "N1", "f.json", {"published_at": datetime(2026, 4, 20, 10, 0, 0)}
    )
    body = c._client.put_object.call_args.kwargs["Body"].decode("utf-8")
    decoded = json.loads(body)
    assert decoded["published_at"] == "2026-04-20 10:00:00"


def test_put_article_file_propagates_client_error() -> None:
    """Caller (Core 1 ``_process_one``) relies on failure to bubble up."""
    c = _enabled()
    c._client.put_object.side_effect = ClientError(
        {"Error": {"Code": "InternalError", "Message": "boom"}},
        "PutObject",
    )
    with pytest.raises(ClientError):
        c.put_article_file("N1", "f.json", {"t": "x"})


def test_get_article_file_parses_json() -> None:
    c = _enabled()
    mock_body = MagicMock()
    mock_body.read.return_value = b'{"title": "\xec\x95\x88\xeb\x85\x95"}'  # UTF-8 "안녕"
    c._client.get_object.return_value = {"Body": mock_body}
    assert c.get_article_file("N1", "f.json") == {"title": "안녕"}


def test_get_article_file_nosuchkey_returns_none() -> None:
    c = _enabled()
    c._client.get_object.side_effect = ClientError(
        {"Error": {"Code": "NoSuchKey", "Message": "not found"}},
        "GetObject",
    )
    assert c.get_article_file("N1", "missing.json") is None


def test_get_article_file_other_client_error_propagates() -> None:
    c = _enabled()
    c._client.get_object.side_effect = ClientError(
        {"Error": {"Code": "AccessDenied", "Message": "nope"}},
        "GetObject",
    )
    with pytest.raises(ClientError):
        c.get_article_file("N1", "f.json")


def test_delete_article_file_returns_true_on_success() -> None:
    c = _enabled()
    assert c.delete_article_file("N1", "f.json") is True
    c._client.delete_object.assert_called_once_with(
        Bucket="test-bucket", Key="articles/N1/f.json"
    )


def test_delete_article_file_returns_false_on_error() -> None:
    c = _enabled()
    c._client.delete_object.side_effect = RuntimeError("boom")
    # Swallowed so test-cleanup fixtures never crash a session.
    assert c.delete_article_file("N1", "f.json") is False


# =============================================================================
# Integration — live S3 v2 bucket
# =============================================================================

_S3_LIVE = bool(os.getenv("S3_ARTICLE_BODY_V2_BUCKET"))
IT_PREFIX_NEWS_ID = "test_v2_2_1_s3_"


@pytest.fixture()
def live_s3_client():
    if not _S3_LIVE:
        pytest.skip("S3_ARTICLE_BODY_V2_BUCKET not set")
    client = S3ArticleV2Client()
    # Best-effort pre-wipe (no-op when nothing was left behind)
    for fn in ("original.json", "version_NT.json"):
        client.delete_article_file(f"{IT_PREFIX_NEWS_ID}rt", fn)
    try:
        yield client
    finally:
        for fn in ("original.json", "version_NT.json"):
            client.delete_article_file(f"{IT_PREFIX_NEWS_ID}rt", fn)


@pytest.mark.integration
def test_integration_roundtrip_put_get_delete(
    live_s3_client: S3ArticleV2Client,
) -> None:
    nid = f"{IT_PREFIX_NEWS_ID}rt"
    data = {"title": "한글 제목", "body": "한글 본문", "n": 42}

    uri = live_s3_client.put_article_file(nid, "original.json", data)
    assert uri.endswith(f"articles/{nid}/original.json")

    fetched = live_s3_client.get_article_file(nid, "original.json")
    assert fetched == data

    assert live_s3_client.delete_article_file(nid, "original.json") is True
    assert live_s3_client.get_article_file(nid, "original.json") is None


@pytest.mark.integration
def test_integration_multiple_files_per_news_id(
    live_s3_client: S3ArticleV2Client,
) -> None:
    """Core 2 stores ``version_{NT,NF,ST,SF}.json`` under one news_id —
    verify the v2 client supports that layout."""
    nid = f"{IT_PREFIX_NEWS_ID}rt"
    live_s3_client.put_article_file(nid, "original.json", {"kind": "orig"})
    live_s3_client.put_article_file(nid, "version_NT.json", {"kind": "nt"})

    assert live_s3_client.get_article_file(nid, "original.json") == {"kind": "orig"}
    assert live_s3_client.get_article_file(nid, "version_NT.json") == {"kind": "nt"}
