"""Unit tests for ``S3ArticleV2Client`` — front-page(지면 1면) 본문 조회 전용.

2026-08-05: `put_article_file`/`delete_article_file`/`build_uri`(Core 1
Collector·Core 2 Transform 쓰기 전용, 둘 다 이미 삭제된 파이프라인)가 클라이언트
본체에서 삭제되며 이 테스트 파일도 같이 축소했다. 남은 `get_article_file`은
`handlers/front_page.py`의 유일한 읽기 경로.
"""
from __future__ import annotations

import logging
from unittest.mock import MagicMock

import pytest
from botocore.exceptions import ClientError

from clients.s3_article_v2_client import S3ArticleV2Client

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


def test_disabled_get_returns_none() -> None:
    assert _disabled().get_article_file("n", "f.json") is None


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
