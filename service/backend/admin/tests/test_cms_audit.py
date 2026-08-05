"""CMS 라우트(letters · media)가 쓰기 액션마다 감사를 남기는지 검증한다.

posts 의 감사 테스트는 test_posts_routes.py 에 있다. 이 파일은 거기서 빠졌던
letters · media 를 덮는다.

Run from service/backend/::

    python3 -m pytest admin/tests/test_cms_audit.py -v
"""
from __future__ import annotations

import json

import pytest

from conftest import FakeTable

from routes import letters, media
from shared import audit, ddb_client


@pytest.fixture
def audit_table(monkeypatch) -> FakeTable:
    table = FakeTable()
    monkeypatch.setattr(ddb_client, "config_table", lambda: table)
    audit.reset_context()
    yield table
    audit.reset_context()


def test_letter_update_writes_audit_row(monkeypatch, audit_table) -> None:
    monkeypatch.setattr(letters.letters_repo, "update",
                        lambda letter_id, data: {"id": letter_id, "headline": "제목"})
    resp = letters.handle_update({"headline": "제목"}, {"id": "L1"}, {})
    assert resp["statusCode"] == 200
    assert audit_table.put_calls[0]["action"] == "letter-update"
    assert audit_table.put_calls[0]["detail"] == {"id": "L1"}


def test_letter_update_missing_writes_no_audit(monkeypatch, audit_table) -> None:
    monkeypatch.setattr(letters.letters_repo, "update", lambda letter_id, data: None)
    resp = letters.handle_update({}, {"id": "nope"}, {})
    assert resp["statusCode"] == 404
    assert audit_table.put_calls == []


def test_letter_delete_writes_audit_row(monkeypatch, audit_table) -> None:
    monkeypatch.setattr(letters.letters_repo, "soft_delete", lambda letter_id: True)
    resp = letters.handle_delete({}, {"id": "L2"}, {})
    assert resp["statusCode"] == 200
    assert audit_table.put_calls[0]["action"] == "letter-delete"
    assert audit_table.put_calls[0]["detail"] == {"id": "L2"}


def test_letter_delete_missing_writes_no_audit(monkeypatch, audit_table) -> None:
    monkeypatch.setattr(letters.letters_repo, "soft_delete", lambda letter_id: False)
    resp = letters.handle_delete({}, {"id": "nope"}, {})
    assert resp["statusCode"] == 404
    assert audit_table.put_calls == []


def test_media_presign_writes_audit_without_leaking_url(monkeypatch, audit_table) -> None:
    """presigned URL 은 만료 전까지 유효한 쓰기 자격증명이다 — 감사에 남으면 안 된다."""
    class _FakeS3:
        def generate_presigned_url(self, op, Params, ExpiresIn):
            return "https://signed.example/UPLOAD-CREDENTIAL?sig=SECRETSIG"

    monkeypatch.setattr(media, "_bucket", lambda: "test-bucket")
    monkeypatch.setattr(media, "_s3", lambda: _FakeS3())

    resp = media.handle_presign(
        {"filename": "a.png", "content_type": "image/png", "size": 100}, {}, {})
    assert resp["statusCode"] == 200

    row = audit_table.put_calls[0]
    assert row["action"] == "media-presign"
    assert row["detail"]["content_type"] == "image/png"
    assert row["detail"]["key"].endswith("a.png")
    serialized = json.dumps(row, ensure_ascii=False)
    assert "SECRETSIG" not in serialized
    assert "UPLOAD-CREDENTIAL" not in serialized


def test_media_presign_rejects_bad_content_type_without_audit(audit_table) -> None:
    resp = media.handle_presign(
        {"filename": "a.exe", "content_type": "application/x-msdownload", "size": 100}, {}, {})
    assert resp["statusCode"] == 400
    assert audit_table.put_calls == []
