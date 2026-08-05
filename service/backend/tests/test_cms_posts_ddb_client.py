"""cms_posts_ddb_client 유닛 테스트 — moto 로 인메모리 DynamoDB 대고 돈다.

2026-08-04: pgvector RDS 삭제 후 CMS posts 를 DynamoDB 로 재구축하며 신규 작성.
admin/tests/test_posts_repo.py 와 같은 테이블(sedaily-mbti-cms-posts-dev)을 보는
공개 조회 전용 클라이언트라, 여기서는 채널·날짜 필터·slug 조회·발행 상태 체크만
검증한다 (쓰기 경로는 admin 쪽에서 이미 커버).

Run from ``backend/``::

    python3 -m pytest v2/tests/test_cms_posts_ddb_client.py -v
"""
from __future__ import annotations

import sys
import uuid
from pathlib import Path

import boto3
import pytest
from moto import mock_aws

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from clients import cms_posts_ddb_client as posts_client  # noqa: E402

_TABLE_NAME = "sedaily-mbti-cms-posts-dev-test"


@pytest.fixture
def ddb_table(monkeypatch):
    with mock_aws():
        resource = boto3.resource("dynamodb", region_name="us-east-1")
        table = resource.create_table(
            TableName=_TABLE_NAME,
            KeySchema=[{"AttributeName": "id", "KeyType": "HASH"}],
            AttributeDefinitions=[
                {"AttributeName": "id", "AttributeType": "S"},
                {"AttributeName": "slug", "AttributeType": "S"},
                {"AttributeName": "status", "AttributeType": "S"},
                {"AttributeName": "publish_date", "AttributeType": "S"},
            ],
            GlobalSecondaryIndexes=[
                {
                    "IndexName": "slug-index",
                    "KeySchema": [{"AttributeName": "slug", "KeyType": "HASH"}],
                    "Projection": {"ProjectionType": "ALL"},
                },
                {
                    "IndexName": "status-publish_date-index",
                    "KeySchema": [
                        {"AttributeName": "status", "KeyType": "HASH"},
                        {"AttributeName": "publish_date", "KeyType": "RANGE"},
                    ],
                    "Projection": {"ProjectionType": "ALL"},
                },
            ],
            BillingMode="PAY_PER_REQUEST",
        )
        table.wait_until_exists()
        monkeypatch.setattr(posts_client, "_table", lambda: table)
        yield table


def _put(table, **overrides) -> dict:
    item = {
        "id": str(uuid.uuid4()),
        "slug": "2026-07-27-제목",
        "status": "published",
        "channels": ["letters"],
        "publish_date": "2026-07-27",
        "mbti_group": "NF",
        "editor_id": "하은",
        "headline": "제목",
        "subtitle": "부제",
        "closing_line": "닫는 줄",
        "body_inline": {"body": ["문단1"]},
        "cover_image_url": "",
        "published_at": "2026-07-27T09:00:00+00:00",
    }
    item.update(overrides)
    table.put_item(Item=item)
    return item


def test_list_published_posts_filters_by_channel(ddb_table) -> None:
    _put(ddb_table, slug="a", channels=["letters"])
    _put(ddb_table, slug="b", channels=["paper"])
    out = posts_client.list_published_posts("letters", None, limit=20)
    assert len(out) == 1
    assert out[0]["slug"] == "a"


def test_list_published_posts_excludes_draft(ddb_table) -> None:
    _put(ddb_table, slug="draft-one", status="draft")
    out = posts_client.list_published_posts("letters", None, limit=20)
    assert out == []


def test_list_published_posts_excludes_soft_deleted(ddb_table) -> None:
    _put(ddb_table, slug="deleted-one", deleted_at="2026-07-28T00:00:00+00:00")
    out = posts_client.list_published_posts("letters", None, limit=20)
    assert out == []


def test_list_published_posts_filters_by_date(ddb_table) -> None:
    _put(ddb_table, slug="day1", publish_date="2026-07-27")
    _put(ddb_table, slug="day2", publish_date="2026-07-28")
    out = posts_client.list_published_posts("letters", "2026-07-28", limit=20)
    assert len(out) == 1
    assert out[0]["slug"] == "day2"


def test_get_published_post_by_slug_found(ddb_table) -> None:
    _put(ddb_table, slug="hello")
    out = posts_client.get_published_post_by_slug("hello")
    assert out is not None
    assert out["headline"] == "제목"


def test_get_published_post_by_slug_missing(ddb_table) -> None:
    assert posts_client.get_published_post_by_slug("nope") is None


def test_get_published_post_by_slug_rejects_draft(ddb_table) -> None:
    _put(ddb_table, slug="still-draft", status="draft")
    assert posts_client.get_published_post_by_slug("still-draft") is None


def test_get_published_post_by_slug_rejects_soft_deleted(ddb_table) -> None:
    _put(ddb_table, slug="deleted-slug", deleted_at="2026-07-28T00:00:00+00:00")
    assert posts_client.get_published_post_by_slug("deleted-slug") is None
