"""공개 posts API 유닛 테스트 — posts_client(DynamoDB)를 fake 로 대체.

2026-08-06: pgvector 방식을 기대하던 옛 버전(PgVectorV2Client monkeypatch)이
2026-08-04 DynamoDB 이관 이후 계속 AttributeError로 깨져 있던 걸 발견해
handlers/cms_posts_public.py의 실제 의존성(clients.cms_posts_ddb_client)에
맞춰 다시 썼다 — 그동안 "무관한 사전 존재 실패" 9건으로 넘어가던 것들.

Run from service/backend/::

    python3 -m pytest tests/test_cms_posts_public.py -v -m 'not integration'
"""
from __future__ import annotations

import json
from typing import Any

import pytest

from handlers import cms_posts_public
from handlers.cms_posts_public import lambda_handler


class _FakePosts:
    def __init__(self, rows: list[dict], one: dict | None = None) -> None:
        self.rows = rows
        self.one = one


def _install(monkeypatch, fake: _FakePosts) -> None:
    monkeypatch.setattr(
        cms_posts_public.posts_client, "list_published_posts",
        lambda channel, date, limit=20: fake.rows,
    )
    monkeypatch.setattr(
        cms_posts_public.posts_client, "get_published_post_by_slug",
        lambda slug: fake.one,
    )


def _row(**over) -> dict:
    base = {
        "id": "11111111-1111-1111-1111-111111111111",
        "slug": "2026-07-27-제목",
        "channels": ["letters"],
        "publish_date": "2026-07-27",
        "mbti_group": "NF",
        "editor_id": "하은",
        "headline": "제목",
        "subtitle": "부제",
        "closing_line": "닫는 줄",
        "body_inline": {
            "body": ["문단1", "문단2"],
            "key_points": ["요점"],
            "keywords": [{"term": "금리", "explain": "설명"}],
            "images": [{"url": "https://img/x.jpg"}],
        },
        "cover_image_url": "https://img/cover.jpg",
        "published_at": "2026-07-27T09:00:00+00:00",
    }
    base.update(over)
    return base


def _get(qs: dict[str, Any] | None = None, path: dict | None = None) -> dict:
    e: dict[str, Any] = {"httpMethod": "GET"}
    if qs:
        e["queryStringParameters"] = qs
    if path:
        e["pathParameters"] = path
    return e


def test_options_returns_200_with_cors(monkeypatch) -> None:
    _install(monkeypatch, _FakePosts([]))
    resp = lambda_handler({"httpMethod": "OPTIONS"}, None)
    assert resp["statusCode"] == 200
    assert "Access-Control-Allow-Origin" in resp["headers"]


def test_invalid_channel_returns_400(monkeypatch) -> None:
    _install(monkeypatch, _FakePosts([]))
    resp = lambda_handler(_get({"channel": "bogus"}), None)
    assert resp["statusCode"] == 400


def test_letters_channel_shapes_like_api_letter(monkeypatch) -> None:
    _install(monkeypatch, _FakePosts([_row()]))
    resp = lambda_handler(_get({"channel": "letters", "date": "2026-07-27"}), None)
    assert resp["statusCode"] == 200
    p = json.loads(resp["body"])["posts"][0]
    assert p["id"] == "2026-07-27-제목"          # id <- slug
    assert p["headline"] == "제목"
    assert p["body"] == ["문단1", "문단2"]
    assert p["key_points"] == ["요점"]
    assert p["mbti_group"] == "NF"
    assert p["is_cms"] is True


def test_paper_channel_shapes_like_front_page(monkeypatch) -> None:
    _install(monkeypatch, _FakePosts([_row(channels=["paper"])]))
    resp = lambda_handler(_get({"channel": "paper"}), None)
    p = json.loads(resp["body"])["posts"][0]
    assert p["news_id"] == "2026-07-27-제목"
    assert p["title"] == "제목"
    assert p["sub_title"] == "부제"
    assert p["content"] == "문단1\n\n문단2"
    assert p["image_url"] == "https://img/cover.jpg"
    assert p["is_top"] is False
    assert p["content_blocks"][0] == {"type": "text", "text_ko": "문단1"}
    assert p["content_blocks"][-1] == {"type": "image", "url": "https://img/x.jpg"}


def test_null_editor_falls_back_to_team_name(monkeypatch) -> None:
    _install(monkeypatch, _FakePosts([_row(editor_id=None)]))
    resp = lambda_handler(_get({"channel": "letters"}), None)
    p = json.loads(resp["body"])["posts"][0]
    assert p["editor_id"] == "AI LENS"


def test_slug_lookup_returns_404_when_missing(monkeypatch) -> None:
    _install(monkeypatch, _FakePosts([], one=None))
    resp = lambda_handler(_get(path={"slug": "없는-글"}), None)
    assert resp["statusCode"] == 404


def test_slug_lookup_returns_post(monkeypatch) -> None:
    _install(monkeypatch, _FakePosts([], one=_row()))
    resp = lambda_handler(_get(path={"slug": "2026-07-27-제목"}), None)
    assert resp["statusCode"] == 200
    assert json.loads(resp["body"])["post"]["headline"] == "제목"


def test_cache_control_header_on_success(monkeypatch) -> None:
    _install(monkeypatch, _FakePosts([]))
    resp = lambda_handler(_get({"channel": "letters"}), None)
    assert resp["headers"]["Cache-Control"] == "public, max-age=300"
