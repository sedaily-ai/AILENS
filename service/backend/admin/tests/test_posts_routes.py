"""posts 라우트 유닛 테스트 — posts_repo 를 fake 로 대체.

Run from service/backend/::

    python3 -m pytest admin/tests/test_posts_routes.py -v
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from routes import posts


def _post(**over) -> dict:
    base = {
        "id": "11111111-1111-1111-1111-111111111111",
        "slug": "2026-07-27-제목",
        "status": "draft",
        "channels": ["letters"],
        "publish_date": "2026-07-27",
        "mbti_group": "NF",
        "editor_id": "하은",
        "headline": "제목",
        "subtitle": "부제",
        "closing_line": None,
        "body_inline": {"body": ["문단1"]},
        "cover_image_url": "",
        "created_by": "admin",
        "created_at": "2026-07-27T09:00:00+00:00",
        "updated_at": "2026-07-27T09:00:00+00:00",
        "published_at": None,
    }
    base.update(over)
    return base


def test_create_requires_headline() -> None:
    resp = posts.handle_create({"publish_date": "2026-07-27"}, {}, {})
    assert resp["statusCode"] == 400
    assert "headline" in json.loads(resp["body"])["error"]


def test_create_requires_publish_date() -> None:
    resp = posts.handle_create({"headline": "제목"}, {}, {})
    assert resp["statusCode"] == 400


def test_create_rejects_unknown_channel() -> None:
    resp = posts.handle_create(
        {"headline": "제목", "publish_date": "2026-07-27", "channels": ["bogus"]}, {}, {}
    )
    assert resp["statusCode"] == 400
    assert "channel" in json.loads(resp["body"])["error"]


def test_create_rejects_invalid_mbti_group() -> None:
    resp = posts.handle_create(
        {"headline": "제목", "publish_date": "2026-07-27", "mbti_group": "XX"}, {}, {}
    )
    assert resp["statusCode"] == 400


def test_create_returns_201(monkeypatch) -> None:
    monkeypatch.setattr(posts.posts_repo, "create", lambda d, created_by: _post())
    resp = posts.handle_create(
        {"headline": "제목", "publish_date": "2026-07-27", "channels": ["letters"]}, {}, {}
    )
    assert resp["statusCode"] == 201
    assert json.loads(resp["body"])["post"]["slug"] == "2026-07-27-제목"


def test_get_returns_404_when_missing(monkeypatch) -> None:
    monkeypatch.setattr(posts.posts_repo, "get", lambda pid: None)
    resp = posts.handle_get({}, {"id": "11111111-1111-1111-1111-111111111111"}, {})
    assert resp["statusCode"] == 404


def test_publish_sets_status(monkeypatch) -> None:
    monkeypatch.setattr(
        posts.posts_repo, "set_status", lambda pid, s: _post(status=s, published_at="now")
    )
    resp = posts.handle_publish({}, {"id": "11111111-1111-1111-1111-111111111111"}, {})
    assert resp["statusCode"] == 200
    assert json.loads(resp["body"])["post"]["status"] == "published"


def test_unpublish_sets_draft(monkeypatch) -> None:
    monkeypatch.setattr(posts.posts_repo, "set_status", lambda pid, s: _post(status=s))
    resp = posts.handle_unpublish({}, {"id": "11111111-1111-1111-1111-111111111111"}, {})
    assert json.loads(resp["body"])["post"]["status"] == "draft"


def test_delete_returns_404_when_already_gone(monkeypatch) -> None:
    monkeypatch.setattr(posts.posts_repo, "soft_delete", lambda pid: False)
    resp = posts.handle_delete({}, {"id": "11111111-1111-1111-1111-111111111111"}, {})
    assert resp["statusCode"] == 404


def test_list_passes_filters(monkeypatch) -> None:
    seen = {}

    def _fake_list(status, channel, limit):
        seen.update(status=status, channel=channel, limit=limit)
        return [_post()]

    monkeypatch.setattr(posts.posts_repo, "list_posts", _fake_list)
    resp = posts.handle_list({}, {}, {"status": "draft", "channel": "letters", "limit": "5"})
    assert resp["statusCode"] == 200
    assert seen == {"status": "draft", "channel": "letters", "limit": 5}


def test_list_clamps_bad_limit(monkeypatch) -> None:
    seen = {}

    def _fake_list(status, channel, limit):
        seen["limit"] = limit
        return []

    monkeypatch.setattr(posts.posts_repo, "list_posts", _fake_list)
    posts.handle_list({}, {}, {"limit": "9999"})
    assert seen["limit"] == 200
    posts.handle_list({}, {}, {"limit": "abc"})
    assert seen["limit"] == 50


from conftest import FakeTable

from shared import audit, ddb_client


@pytest.fixture
def audit_table(monkeypatch) -> FakeTable:
    table = FakeTable()
    monkeypatch.setattr(ddb_client, "config_table", lambda: table)
    audit.reset_context()
    yield table
    audit.reset_context()


def test_create_writes_audit_row(monkeypatch, audit_table) -> None:
    monkeypatch.setattr(posts.posts_repo, "create",
                        lambda body, created_by: _post(headline=body["headline"]))
    resp = posts.handle_create(
        {"headline": "제목", "publish_date": "2026-07-29"}, {}, {})
    assert resp["statusCode"] == 201
    assert audit_table.put_calls[0]["action"] == "post-create"
    assert audit_table.put_calls[0]["detail"]["slug"] == "2026-07-27-제목"


def test_update_writes_audit_row(monkeypatch, audit_table) -> None:
    monkeypatch.setattr(posts.posts_repo, "update",
                        lambda post_id, body: _post(id=post_id, headline=body["headline"]))
    resp = posts.handle_update(
        {"headline": "새 제목"}, {"id": "11111111-1111-1111-1111-111111111111"}, {})
    assert resp["statusCode"] == 200
    assert audit_table.put_calls[0]["action"] == "post-update"
    assert audit_table.put_calls[0]["detail"]["id"] == "11111111-1111-1111-1111-111111111111"


def test_publish_writes_audit_row(monkeypatch, audit_table) -> None:
    monkeypatch.setattr(posts.posts_repo, "set_status",
                        lambda post_id, status: _post(id=post_id, status=status))
    resp = posts.handle_publish({}, {"id": "11111111-1111-1111-1111-111111111111"}, {})
    assert resp["statusCode"] == 200
    assert len(audit_table.put_calls) == 1
    assert audit_table.put_calls[0]["action"] == "post-publish"
    assert audit_table.put_calls[0]["detail"]["id"] == "11111111-1111-1111-1111-111111111111"


def test_unpublish_uses_distinct_action(monkeypatch, audit_table) -> None:
    monkeypatch.setattr(posts.posts_repo, "set_status",
                        lambda post_id, status: _post(id=post_id, status=status))
    posts.handle_unpublish({}, {"id": "11111111-1111-1111-1111-111111111111"}, {})
    assert audit_table.put_calls[0]["action"] == "post-unpublish"


def test_delete_writes_audit_row(monkeypatch, audit_table) -> None:
    monkeypatch.setattr(posts.posts_repo, "soft_delete", lambda post_id: True)
    resp = posts.handle_delete({}, {"id": "22222222-2222-2222-2222-222222222222"}, {})
    assert resp["statusCode"] == 200
    assert audit_table.put_calls[0]["action"] == "post-delete"
    assert audit_table.put_calls[0]["detail"]["id"] == "22222222-2222-2222-2222-222222222222"


def test_failed_validation_writes_no_audit(audit_table) -> None:
    """검증 실패는 감사 대상이 아니다."""
    resp = posts.handle_create({"publish_date": "2026-07-29"}, {}, {})
    assert resp["statusCode"] == 400
    assert audit_table.put_calls == []


def test_missing_post_delete_writes_no_audit(monkeypatch, audit_table) -> None:
    monkeypatch.setattr(posts.posts_repo, "soft_delete", lambda post_id: False)
    resp = posts.handle_delete({}, {"id": "nope"}, {})
    assert resp["statusCode"] == 404
    assert audit_table.put_calls == []
