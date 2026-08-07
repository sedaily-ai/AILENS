"""presign 라우트 유닛 테스트 — boto3 를 fake 로 대체.

Run from service/backend/::

    python3 -m pytest admin/tests/test_media.py -v
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from routes import media


def _install(monkeypatch, url: str = "https://s3.example/put") -> dict:
    seen: dict = {}

    class _FakeS3:
        def generate_presigned_url(self, op, Params, ExpiresIn):  # noqa: N803
            seen.update(op=op, params=Params, expires=ExpiresIn)
            return url

    monkeypatch.setattr(media, "_s3", lambda: _FakeS3())
    monkeypatch.setattr(media, "_bucket", lambda: "test-bucket")
    return seen


def test_rejects_non_image(monkeypatch) -> None:
    _install(monkeypatch)
    resp = media.handle_presign(
        {"filename": "a.pdf", "content_type": "application/pdf", "size": 100}, {}, {}
    )
    assert resp["statusCode"] == 400
    assert "image" in json.loads(resp["body"])["error"]


def test_rejects_oversize(monkeypatch) -> None:
    _install(monkeypatch)
    resp = media.handle_presign(
        {"filename": "a.jpg", "content_type": "image/jpeg", "size": 20 * 1024 * 1024},
        {},
        {},
    )
    assert resp["statusCode"] == 400


def test_rejects_zero_size(monkeypatch) -> None:
    _install(monkeypatch)
    resp = media.handle_presign(
        {"filename": "a.jpg", "content_type": "image/jpeg", "size": 0}, {}, {}
    )
    assert resp["statusCode"] == 400


def test_requires_filename(monkeypatch) -> None:
    _install(monkeypatch)
    resp = media.handle_presign({"content_type": "image/jpeg", "size": 10}, {}, {})
    assert resp["statusCode"] == 400


def test_errors_when_bucket_unconfigured(monkeypatch) -> None:
    _install(monkeypatch)
    monkeypatch.setattr(media, "_bucket", lambda: "")
    resp = media.handle_presign(
        {"filename": "a.jpg", "content_type": "image/jpeg", "size": 10}, {}, {}
    )
    assert resp["statusCode"] == 500


def test_returns_upload_and_public_url(monkeypatch) -> None:
    seen = _install(monkeypatch)
    resp = media.handle_presign(
        {"filename": "사진 1.JPG", "content_type": "image/jpeg", "size": 1024}, {}, {}
    )
    assert resp["statusCode"] == 200
    d = json.loads(resp["body"])
    assert d["upload_url"] == "https://s3.example/put"
    assert d["key"].startswith("media/")
    assert d["public_url"].endswith(d["key"])
    # 파일명은 정규화되어 공백·대문자가 사라진다.
    assert " " not in d["key"]
    assert d["key"] == d["key"].lower()
    assert seen["expires"] == 300
    assert seen["params"]["ContentType"] == "image/jpeg"
    assert seen["params"]["Bucket"] == "test-bucket"


def test_korean_filename_keeps_extension_and_gets_stem(monkeypatch) -> None:
    """한글 파일명은 ASCII 로 남는 글자가 없다 — '<uuid>-.png' 가 되면 안 된다."""
    _install(monkeypatch)
    resp = media.handle_presign(
        {"filename": "테스트 이미지.PNG", "content_type": "image/png", "size": 10}, {}, {}
    )
    key = json.loads(resp["body"])["key"]
    assert key.endswith("-img.png"), key
    assert "-." not in key


def test_ascii_filename_is_preserved(monkeypatch) -> None:
    _install(monkeypatch)
    resp = media.handle_presign(
        {"filename": "Chart Q3.PNG", "content_type": "image/png", "size": 10}, {}, {}
    )
    key = json.loads(resp["body"])["key"]
    assert key.endswith("-chart-q3.png"), key


def test_keys_are_unique_per_call(monkeypatch) -> None:
    _install(monkeypatch)
    args = {"filename": "a.jpg", "content_type": "image/jpeg", "size": 10}
    k1 = json.loads(media.handle_presign(dict(args), {}, {})["body"])["key"]
    k2 = json.loads(media.handle_presign(dict(args), {}, {})["body"])["key"]
    assert k1 != k2, "같은 파일명이 서로 덮어쓰면 안 된다"
