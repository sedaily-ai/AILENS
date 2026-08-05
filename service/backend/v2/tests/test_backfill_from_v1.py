"""Unit tests for v1 -> v2 backfill script (TASK-2.5).

Pure helpers + backfill_one with mocked clients. No live AWS.

Run from ``backend/``::

    python3 -m pytest v2/tests/test_backfill_from_v1.py -v
"""
from __future__ import annotations

from typing import Any, Dict
from unittest.mock import MagicMock

import pytest

from v2.tools.backfill_from_v1 import (
    MBTI_GROUPS,
    backfill_one,
    extract_versions,
    fetch_v1_body,
)


# =============================================================================
# extract_versions
# =============================================================================


def _make_version(group: str) -> Dict[str, Any]:
    return {
        "title": f"{group} 제목",
        "body": f"{group} 본문 " * 20,
        "subtitle": f"{group} 부제",
        "key_points": ["p1", "p2"],
        "closing_line": f"{group} 마무리",
    }


def _make_full_body(news_id: str = "test_v2_2_5_id1") -> Dict[str, Any]:
    body = {
        "news_id": news_id,
        "title_ko": "원본 제목",
        "content_ko": "원본 본문 " * 300,
        "content_raw": "<p>원본</p>",
        "sub_title_ko": "원본 부제",
        "category": "경제",
        "published_at": "2026-04-20T10:00:00+09:00",
        "url": f"https://sedaily.com/article/{news_id}",
        "press": "서울경제",
        "images": [],
    }
    for g in MBTI_GROUPS:
        body[f"version_{g}"] = _make_version(g)
    return body


def test_v2_2_5_extract_versions_all_present() -> None:
    versions = extract_versions(_make_full_body())
    assert versions is not None
    assert set(versions.keys()) == set(MBTI_GROUPS)


def test_v2_2_5_extract_versions_missing_group_returns_none() -> None:
    body = _make_full_body()
    del body["version_SF"]
    assert extract_versions(body) is None


def test_v2_2_5_extract_versions_empty_title_returns_none() -> None:
    body = _make_full_body()
    body["version_NT"]["title"] = ""
    assert extract_versions(body) is None


def test_v2_2_5_extract_versions_empty_body_returns_none() -> None:
    body = _make_full_body()
    body["version_NF"]["body"] = ""
    assert extract_versions(body) is None


def test_v2_2_5_extract_versions_wrong_type_returns_none() -> None:
    body = _make_full_body()
    body["version_ST"] = "not a dict"
    assert extract_versions(body) is None


# =============================================================================
# fetch_v1_body — S3 URI resolution
# =============================================================================


def test_v2_2_5_fetch_v1_body_uses_s3_body_uri_when_present(monkeypatch) -> None:
    """s3://bucket/key form is parsed correctly."""
    import json as _json
    import v2.tools.backfill_from_v1 as bf

    seen: Dict[str, str] = {}

    def fake_get_object(**kwargs):
        seen.update({"Bucket": kwargs["Bucket"], "Key": kwargs["Key"]})
        return {"Body": MagicMock(read=lambda: _json.dumps({"stub": True}).encode())}

    fake_client = MagicMock()
    fake_client.get_object.side_effect = fake_get_object
    monkeypatch.setattr(
        bf.boto3, "client", lambda svc, **kw: fake_client if svc == "s3" else None
    )

    result = fetch_v1_body(
        "test_v2_2_5_id1",
        {"s3_body_uri": "s3://custom-bucket/path/to/body.json"},
    )
    assert result == {"stub": True}
    assert seen == {"Bucket": "custom-bucket", "Key": "path/to/body.json"}


def test_v2_2_5_fetch_v1_body_falls_back_to_default_key(monkeypatch) -> None:
    """Missing s3_body_uri → articles/{news_id}/body.json in default bucket."""
    import json as _json
    import v2.tools.backfill_from_v1 as bf

    seen: Dict[str, str] = {}

    def fake_get_object(**kwargs):
        seen.update({"Bucket": kwargs["Bucket"], "Key": kwargs["Key"]})
        return {"Body": MagicMock(read=lambda: _json.dumps({"stub": True}).encode())}

    fake_client = MagicMock()
    fake_client.get_object.side_effect = fake_get_object
    monkeypatch.setattr(
        bf.boto3, "client", lambda svc, **kw: fake_client if svc == "s3" else None
    )

    fetch_v1_body("test_v2_2_5_id2", {})  # no s3_body_uri
    assert seen == {
        "Bucket": "sedaily-mbti-article-body-dev",
        "Key": "articles/test_v2_2_5_id2/body.json",
    }


def test_v2_2_5_fetch_v1_body_returns_none_on_s3_error(monkeypatch) -> None:
    import v2.tools.backfill_from_v1 as bf

    fake_client = MagicMock()
    fake_client.get_object.side_effect = RuntimeError("NoSuchKey")
    monkeypatch.setattr(
        bf.boto3, "client", lambda svc, **kw: fake_client if svc == "s3" else None
    )

    assert fetch_v1_body("missing_id", {}) is None


# =============================================================================
# backfill_one
# =============================================================================


def _make_article(news_id: str = "test_v2_2_5_id1") -> Dict[str, Any]:
    return {
        "news_id": news_id,
        "title_ko": "원본 제목",
        "category": "경제",
        "published_at": "2026-04-20T10:00:00+09:00",
        "url": f"https://sedaily.com/article/{news_id}",
    }


def _make_mocks() -> Dict[str, Any]:
    embedder = MagicMock()
    embedder.embed_text.return_value = [0.01] * 1024
    pg = MagicMock()
    pg.insert_article.return_value = None
    pg.insert_article_version.return_value = "version-uuid"
    pg.update_article_status.return_value = None
    s3_v2 = MagicMock()
    s3_v2.put_article_file.return_value = "s3://mock/put"
    return {"embedder": embedder, "pg": pg, "s3_v2": s3_v2}


def test_v2_2_5_backfill_one_dry_run_makes_no_writes() -> None:
    mocks = _make_mocks()
    article = _make_article()
    body = _make_full_body()
    versions = extract_versions(body)
    assert versions is not None

    result = backfill_one(
        article, body, versions, dry_run=True, **mocks
    )
    assert result == article["news_id"]
    mocks["embedder"].embed_text.assert_not_called()
    mocks["pg"].insert_article.assert_not_called()
    mocks["pg"].insert_article_version.assert_not_called()
    mocks["pg"].update_article_status.assert_not_called()
    mocks["s3_v2"].put_article_file.assert_not_called()


def test_v2_2_5_backfill_one_apply_writes_5_s3_files_4_versions_1_article() -> None:
    """Apply mode: 1 original.json + 4 version_*.json + 1 articles row + 4 versions."""
    mocks = _make_mocks()
    article = _make_article()
    body = _make_full_body()
    versions = extract_versions(body)
    assert versions is not None

    backfill_one(article, body, versions, dry_run=False, **mocks)

    # 1 + 4 = 5 S3 puts
    assert mocks["s3_v2"].put_article_file.call_count == 5
    put_files = {c.args[1] for c in mocks["s3_v2"].put_article_file.call_args_list}
    assert put_files == {
        "original.json",
        "version_NT.json",
        "version_NF.json",
        "version_ST.json",
        "version_SF.json",
    }

    # 1 articles row + 4 article_versions rows
    mocks["pg"].insert_article.assert_called_once()
    assert mocks["pg"].insert_article_version.call_count == 4

    # Status promoted to transformed at end
    mocks["pg"].update_article_status.assert_called_once_with(
        article["news_id"], "transformed"
    )

    # 5 embeddings: 1 for original, 4 for versions
    assert mocks["embedder"].embed_text.call_count == 5


def test_v2_2_5_backfill_one_metadata_marks_backfilled_flag() -> None:
    """The articles row's metadata dict should record the backfill provenance."""
    mocks = _make_mocks()
    article = _make_article()
    body = _make_full_body()
    versions = extract_versions(body)
    assert versions is not None

    backfill_one(article, body, versions, dry_run=False, **mocks)

    call = mocks["pg"].insert_article.call_args
    metadata = call.kwargs.get("metadata") or call.args[1]
    assert metadata.get("backfilled_from_v1") is True
    assert "backfilled_at" in metadata


def test_v2_2_5_backfill_one_prefers_metadata_title_over_body_title() -> None:
    """Article's title_ko should win over body's, matching production path."""
    mocks = _make_mocks()
    article = _make_article()
    article["title_ko"] = "메타 제목"
    body = _make_full_body()
    body["title_ko"] = "바디 제목"  # different — should NOT be used
    versions = extract_versions(body)
    assert versions is not None

    backfill_one(article, body, versions, dry_run=False, **mocks)

    # The first put (original.json) carries title_ko.
    original_put = [
        c for c in mocks["s3_v2"].put_article_file.call_args_list
        if c.args[1] == "original.json"
    ][0]
    assert original_put.args[2]["title_ko"] == "메타 제목"
