"""posts_repo 유닛 테스트 — moto 로 sedaily-mbti-cms-posts-dev 를 흉내낸 실제
DynamoDB(인메모리)에 대고 돈다. AWS 크리덴셜/네트워크 불필요.

2026-08-04: pgvector RDS 삭제에 따라 posts_repo 가 SQL → DynamoDB 로 재구축되면서
이 테스트도 pg_client fake 대신 moto 기반으로 다시 썼다. 커버리지는 SQL 버전과 동등.

Run from service/backend/::

    python3 -m pytest admin/tests/test_posts_repo.py -v
"""
from __future__ import annotations

import sys
from pathlib import Path

import boto3
import pytest
from moto import mock_aws

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from repo import posts_repo  # noqa: E402

_TABLE_NAME = "sedaily-mbti-cms-posts-dev-test"


@pytest.fixture
def ddb_table(monkeypatch):
    """실제 posts_table() 호출을 moto 백엔드의 임시 테이블로 바꿔치기한다.

    shared.ddb_client 의 boto3 resource 싱글턴은 모듈 로드 시점에 이미 만들어져
    있어 mock_aws 활성화 전이라 그대로 못 쓴다 — posts_repo.posts_table 자체를
    monkeypatch 해서 우회한다.
    """
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
        monkeypatch.setattr(posts_repo, "posts_table", lambda: table)
        yield table


def _create(ddb_table, **overrides) -> dict:
    data = {
        "publish_date": "2026-07-27",
        "headline": "제목",
        "channels": ["letters"],
        "subtitle": "부제",
        "closing_line": "닫는 줄",
        "editor_id": "하은",
        "body_inline": {"body": ["문단1"]},
    }
    data.update(overrides)
    return posts_repo.create(data, created_by="admin")


def test_create_generates_slug_and_returns_row(ddb_table) -> None:
    out = _create(ddb_table)
    assert out["slug"] == "2026-07-27-제목"
    assert out["status"] == "draft"
    assert out["channels"] == ["letters"]
    assert out["published_at"] is None


def test_create_suffixes_slug_on_conflict(ddb_table) -> None:
    _create(ddb_table)
    _create(ddb_table)
    third = _create(ddb_table)
    assert third["slug"] == "2026-07-27-제목-3"


def test_get_returns_none_when_missing(ddb_table) -> None:
    assert posts_repo.get("11111111-1111-1111-1111-111111111111") is None


def test_get_returns_none_when_soft_deleted(ddb_table) -> None:
    post = _create(ddb_table)
    posts_repo.soft_delete(post["id"])
    assert posts_repo.get(post["id"]) is None


def test_soft_delete_sets_deleted_at(ddb_table) -> None:
    post = _create(ddb_table)
    assert posts_repo.soft_delete(post["id"]) is True
    # 이미 삭제된 걸 다시 지우면 False — SQL 버전의 idempotency 계약과 동일.
    assert posts_repo.soft_delete(post["id"]) is False


def test_list_posts_filters_by_status_and_channel(ddb_table) -> None:
    _create(ddb_table, channels=["letters"])
    _create(ddb_table, channels=["paper"])
    out = posts_repo.list_posts("draft", "letters", limit=20)
    assert len(out) == 1
    assert out[0]["channels"] == ["letters"]


def test_list_posts_excludes_soft_deleted(ddb_table) -> None:
    post = _create(ddb_table)
    posts_repo.soft_delete(post["id"])
    assert posts_repo.list_posts("draft", None, limit=20) == []


def test_list_posts_filters_by_date(ddb_table) -> None:
    _create(ddb_table, publish_date="2026-08-05")
    _create(ddb_table, publish_date="2026-08-06")
    out = posts_repo.list_posts("draft", None, limit=20, date="2026-08-06")
    assert len(out) == 1
    assert out[0]["publish_date"] == "2026-08-06"


def test_set_status_publish_stamps_published_at(ddb_table) -> None:
    post = _create(ddb_table)
    out = posts_repo.set_status(post["id"], "published")
    assert out is not None
    assert out["status"] == "published"
    assert out["published_at"] is not None


def test_set_status_rejects_unknown_value(ddb_table) -> None:
    with pytest.raises(ValueError):
        posts_repo.set_status("11111111-1111-1111-1111-111111111111", "bogus")


# --- 회귀: 부분 수정이 누락 필드를 지우면 안 된다 (2026-07-28 스모크 사고, SQL 버전 때 발견) ---


def test_update_only_touches_provided_keys(ddb_table) -> None:
    post = _create(ddb_table)
    out = posts_repo.update(post["id"], {"subtitle": "새 부제"})
    assert out is not None
    assert out["subtitle"] == "새 부제"
    # 보내지 않은 필드는 원래 값 그대로 — 유실되면 안 된다.
    assert out["editor_id"] == "하은"
    assert out["headline"] == "제목"
    assert out["closing_line"] == "닫는 줄"


def test_update_allows_explicit_null_to_clear(ddb_table) -> None:
    post = _create(ddb_table)
    out = posts_repo.update(post["id"], {"editor_id": None})
    assert out is not None
    assert out["editor_id"] is None


def test_update_with_no_fields_returns_current(ddb_table) -> None:
    post = _create(ddb_table)
    out = posts_repo.update(post["id"], {})
    assert out is not None
    assert out["headline"] == post["headline"]


def test_update_returns_none_when_missing(ddb_table) -> None:
    assert posts_repo.update("11111111-1111-1111-1111-111111111111", {"subtitle": "x"}) is None
