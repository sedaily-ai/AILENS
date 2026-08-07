"""letters_repo 유닛 테스트 — moto 로 sedaily-mbti-daily-letters-dev 를 흉내낸 실제
DynamoDB(인메모리)에 대고 돈다. AWS 크리덴셜/네트워크 불필요.

2026-08-04: pgvector RDS 삭제에 따라 letters_repo 가 SQL → DynamoDB 로 재구축되며
이 테스트도 pg_client fake 대신 moto 기반으로 다시 썼다. test_posts_repo.py 와 같은 패턴.

Run from service/backend/::

    python3 -m pytest admin/tests/test_letters_repo.py -v
"""
from __future__ import annotations

import sys
import uuid
from pathlib import Path

import boto3
import pytest
from moto import mock_aws

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from repo import letters_repo  # noqa: E402

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
        monkeypatch.setattr(letters_repo, "letters_table", lambda: table)
        yield table


def _put(table, **overrides) -> dict:
    # Editor Pick 이 만드는 row 모양 — admin 은 이 중 일부만 편집 가능(_UPDATABLE).
    item = {
        "id": str(uuid.uuid4()),
        "letter_date": "2026-08-04",
        "editor_id": "민철",
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


def test_list_by_date_orders_by_created_at(ddb_table) -> None:
    # MBTI 페르소나 폐기(2026-08) 이후 정렬은 그룹이 아니라 생성 시각 기준이다.
    _put(ddb_table, editor_id="c", created_at="2026-08-04T03:00:00+00:00")
    _put(ddb_table, editor_id="a", created_at="2026-08-04T01:00:00+00:00")
    _put(ddb_table, editor_id="b", created_at="2026-08-04T02:00:00+00:00")
    out = letters_repo.list_by_date("2026-08-04")
    assert [r["editor_id"] for r in out] == ["a", "b", "c"]


def test_list_by_date_excludes_soft_deleted(ddb_table) -> None:
    _put(ddb_table, deleted_at="2026-08-04T02:00:00+00:00")
    assert letters_repo.list_by_date("2026-08-04") == []


def test_list_by_date_filters_other_dates(ddb_table) -> None:
    _put(ddb_table, letter_date="2026-08-03")
    assert letters_repo.list_by_date("2026-08-04") == []


def test_get_found(ddb_table) -> None:
    row = _put(ddb_table)
    out = letters_repo.get(row["id"])
    assert out is not None
    assert out["headline"] == "제목"


def test_get_returns_none_when_missing(ddb_table) -> None:
    assert letters_repo.get("11111111-1111-1111-1111-111111111111") is None


def test_get_returns_none_when_soft_deleted(ddb_table) -> None:
    row = _put(ddb_table)
    letters_repo.soft_delete(row["id"])
    assert letters_repo.get(row["id"]) is None


def test_soft_delete_is_idempotent_false_second_time(ddb_table) -> None:
    row = _put(ddb_table)
    assert letters_repo.soft_delete(row["id"]) is True
    assert letters_repo.soft_delete(row["id"]) is False


# --- 정체성 필드는 편집 대상에서 제외된다 (파이프라인 전담) ---


def test_update_only_touches_editable_fields(ddb_table) -> None:
    row = _put(ddb_table)
    out = letters_repo.update(row["id"], {
        "subtitle": "새 부제",
        "editor_id": "소율",  # _UPDATABLE 밖 — 무시돼야 함
    })
    assert out is not None
    assert out["subtitle"] == "새 부제"
    assert out["editor_id"] == "민철"


def test_update_returns_none_when_missing(ddb_table) -> None:
    assert letters_repo.update("11111111-1111-1111-1111-111111111111", {"subtitle": "x"}) is None


def test_update_with_no_fields_returns_current(ddb_table) -> None:
    row = _put(ddb_table)
    out = letters_repo.update(row["id"], {})
    assert out is not None
    assert out["headline"] == row["headline"]
