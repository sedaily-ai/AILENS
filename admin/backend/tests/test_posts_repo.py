"""posts_repo 유닛 테스트 — v1.21부터 posts_repo는 순수 HTTP 클라이언트라
lens-cms-api(EC2)를 실제로 호출하는 대신 urllib.request.urlopen을 fake로
대체해서 "요청을 올바르게 만드는지"만 검증한다.

CRUD 로직 자체(slug 생성, 부분 수정 계약, lens 분해 등)의 정확성은
service/lens-cms-api/admin_posts_repo.py가 실제로 갖고 있고, 그쪽은
Postgres에 대고 도는 별도 스크립트로 수동 검증했다(docs/architecture/
db-changelog/postgres/v1.21-admin-쓰기-전환.md 참조) — 이 파일이 그
로직까지 재검증하지 않는다, 대상이 다르다.

Run from admin/backend/::

    python3 -m pytest tests/test_posts_repo.py -v
"""
from __future__ import annotations

import json
import sys
from pathlib import Path
from urllib.error import HTTPError

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from repo import posts_repo  # noqa: E402


class _FakeResponse:
    def __init__(self, payload: dict):
        self._body = json.dumps(payload).encode()

    def read(self):
        return self._body

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


@pytest.fixture(autouse=True)
def _fake_token(monkeypatch):
    monkeypatch.setattr(posts_repo, "get_secure", lambda name: "test-token")


def _capture_urlopen(monkeypatch, response_payload: dict):
    captured = {}

    def fake_urlopen(req, timeout=None):
        captured["url"] = req.full_url
        captured["method"] = req.get_method()
        captured["headers"] = dict(req.header_items())
        captured["body"] = json.loads(req.data) if req.data else None
        return _FakeResponse(response_payload)

    monkeypatch.setattr(posts_repo.urllib.request, "urlopen", fake_urlopen)
    return captured


def test_create_posts_to_admin_posts_with_token(monkeypatch):
    captured = _capture_urlopen(monkeypatch, {"post": {"id": "abc", "slug": "s"}})
    out = posts_repo.create({"headline": "제목"}, created_by="admin")
    assert out == {"id": "abc", "slug": "s"}
    assert captured["method"] == "POST"
    assert captured["url"].endswith("/admin/posts")
    assert captured["body"] == {"data": {"headline": "제목"}, "created_by": "admin"}
    assert captured["headers"].get("X-internal-token") == "test-token"


def test_get_returns_post(monkeypatch):
    captured = _capture_urlopen(monkeypatch, {"post": {"id": "abc"}})
    out = posts_repo.get("abc")
    assert out == {"id": "abc"}
    assert captured["method"] == "GET"
    assert captured["url"].endswith("/admin/posts/abc")


def test_get_returns_none_on_404(monkeypatch):
    def fake_urlopen(req, timeout=None):
        raise HTTPError(req.full_url, 404, "not found", {}, None)

    monkeypatch.setattr(posts_repo.urllib.request, "urlopen", fake_urlopen)
    assert posts_repo.get("missing") is None


def test_list_posts_builds_query_string(monkeypatch):
    captured = _capture_urlopen(monkeypatch, {"posts": [{"id": "1"}]})
    out = posts_repo.list_posts("draft", "letters", limit=10, date="2026-09-09")
    assert out == [{"id": "1"}]
    assert "status=draft" in captured["url"]
    assert "channel=letters" in captured["url"]
    assert "limit=10" in captured["url"]
    assert "date=2026-09-09" in captured["url"]


def test_update_sends_put_with_body(monkeypatch):
    captured = _capture_urlopen(monkeypatch, {"post": {"id": "abc", "subtitle": "새 부제"}})
    out = posts_repo.update("abc", {"subtitle": "새 부제"})
    assert out["subtitle"] == "새 부제"
    assert captured["method"] == "PUT"
    assert captured["body"] == {"subtitle": "새 부제"}


def test_update_returns_none_when_missing(monkeypatch):
    def fake_urlopen(req, timeout=None):
        raise HTTPError(req.full_url, 404, "not found", {}, None)

    monkeypatch.setattr(posts_repo.urllib.request, "urlopen", fake_urlopen)
    assert posts_repo.update("missing", {"subtitle": "x"}) is None


def test_set_status_posts_to_status_endpoint(monkeypatch):
    captured = _capture_urlopen(monkeypatch, {"post": {"id": "abc", "status": "published"}})
    out = posts_repo.set_status("abc", "published")
    assert out["status"] == "published"
    assert captured["url"].endswith("/admin/posts/abc/status")
    assert captured["body"] == {"status": "published"}


def test_soft_delete_sends_delete_and_returns_bool(monkeypatch):
    _capture_urlopen(monkeypatch, {"ok": True})
    assert posts_repo.soft_delete("abc") is True


def test_soft_delete_returns_false_when_missing(monkeypatch):
    def fake_urlopen(req, timeout=None):
        raise HTTPError(req.full_url, 404, "not found", {}, None)

    monkeypatch.setattr(posts_repo.urllib.request, "urlopen", fake_urlopen)
    assert posts_repo.soft_delete("missing") is False
