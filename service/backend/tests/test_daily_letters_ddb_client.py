"""daily_letters_ddb_client 유닛 테스트 — moto 로 인메모리 DynamoDB 대고 돈다.

2026-08-04: pgvector RDS 삭제 후 daily_letters 를 DynamoDB 로 재구축하며 신규 작성.
admin/tests/test_letters_repo.py 와 같은 테이블(sedaily-mbti-daily-letters-dev)을 보는
공개 조회 전용 클라이언트라, 여기서는 날짜 필터·정렬·소프트삭제 제외만 검증한다
(쓰기 경로는 이번 마이그레이션 범위 밖 — Editor Pick 은 아직 손대지 않았다).

Run from ``backend/``::

    python3 -m pytest v2/tests/test_daily_letters_ddb_client.py -v
"""
from __future__ import annotations

import sys
import uuid
from pathlib import Path

import boto3
import pytest
from moto import mock_aws

sys.path.insert(0, str(Path(__file__).resolve().parents[2]))

from clients.ddb import daily_letters as letters_client# noqa: E402

_TABLE_NAME = "sedaily-mbti-daily-letters-dev-test"


@pytest.fixture
def ddb_table(monkeypatch):
    with mock_aws():
        resource = boto3.resource("dynamodb", region_name="us-east-1")
        table = resource.create_table(
            TableName=_TABLE_NAME,
            KeySchema=[{"AttributeName": "id", "KeyType": "HASH"}],
            AttributeDefinitions=[
                {"AttributeName": "id", "AttributeType": "S"},
                {"AttributeName": "letter_date", "AttributeType": "S"},
                {"AttributeName": "editor_id", "AttributeType": "S"},
            ],
            GlobalSecondaryIndexes=[
                {
                    "IndexName": "letter_date-index",
                    "KeySchema": [
                        {"AttributeName": "letter_date", "KeyType": "HASH"},
                        {"AttributeName": "editor_id", "KeyType": "RANGE"},
                    ],
                    "Projection": {"ProjectionType": "ALL"},
                },
            ],
            BillingMode="PAY_PER_REQUEST",
        )
        table.wait_until_exists()
        monkeypatch.setattr(letters_client, "_table", lambda: table)
        yield table


def _put(table, **overrides) -> dict:
    item = {
        "id": str(uuid.uuid4()),
        "letter_date": "2026-08-04",
        "editor_id": "민철",
        "mbti_group": "NT",
        "article_id": "news-1",
        "secondary_article_ids": [],
        "mode": "A",
        "archetype": "전략가",
        "theme": "금리",
        "headline": "제목",
        "subtitle": "부제",
        "closing_line": "닫는 줄",
        "body_inline": {"body": ["문단1"]},
        "keywords": [{"term": "금리", "explain": "설명"}],
        "created_at": "2026-08-04T01:00:00+00:00",
    }
    item.update(overrides)
    table.put_item(Item=item)
    return item


def test_get_daily_letters_orders_by_created_at(ddb_table) -> None:
    _put(ddb_table, editor_id="d", created_at="2026-08-04T04:00:00+00:00")
    _put(ddb_table, editor_id="a", created_at="2026-08-04T01:00:00+00:00")
    _put(ddb_table, editor_id="c", created_at="2026-08-04T03:00:00+00:00")
    _put(ddb_table, editor_id="b", created_at="2026-08-04T02:00:00+00:00")
    out = letters_client.get_daily_letters("2026-08-04")
    assert [r["editor_id"] for r in out] == ["a", "b", "c", "d"]


def test_get_daily_letters_filters_other_dates(ddb_table) -> None:
    _put(ddb_table, letter_date="2026-08-03")
    assert letters_client.get_daily_letters("2026-08-04") == []


def test_get_daily_letters_excludes_soft_deleted(ddb_table) -> None:
    _put(ddb_table, deleted_at="2026-08-04T02:00:00+00:00")
    assert letters_client.get_daily_letters("2026-08-04") == []


def test_get_daily_letters_empty_day_returns_empty_list(ddb_table) -> None:
    assert letters_client.get_daily_letters("2026-01-01") == []
