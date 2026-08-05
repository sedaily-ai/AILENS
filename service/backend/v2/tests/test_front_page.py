"""Unit tests for the Front Page API handler (front-page-live-data spec §5.2).

전부 유닛 — PgVectorV2Client / S3ArticleV2Client 는 fake 로 대체.
Run from ``backend/``::

    python3 -m pytest v2/tests/test_front_page.py -v
"""
from __future__ import annotations

import json
from typing import Any, Dict, List, Optional

import pytest

from v2.handlers import front_page
from v2.handlers.front_page import lambda_handler


# =============================================================================
# Fakes
# =============================================================================


class _FakePg:
    def __init__(
        self,
        rows_by_date: Dict[str, List[Dict[str, Any]]],
        latest: Optional[str] = None,
    ) -> None:
        self.rows_by_date = rows_by_date
        self.latest = latest
        self.closed = False

    def get_front_page_articles(self, paper_date: str) -> List[Dict[str, Any]]:
        return self.rows_by_date.get(paper_date, [])

    def get_latest_front_page_date(self, upper_bound: str) -> Optional[str]:
        return self.latest

    def close(self) -> None:
        self.closed = True


class _FakeS3:
    def __init__(self, bodies: Dict[str, Any]) -> None:
        self.bodies = bodies

    def get_article_file(self, news_id: str, filename: str) -> Optional[Dict[str, Any]]:
        v = self.bodies.get(news_id)
        if isinstance(v, Exception):
            raise v
        return v


def _row(news_id: str, paragraph: str = "9", published_at: str = "2026-07-22T10:00:00+09:00") -> Dict[str, Any]:
    return {
        "news_id": news_id,
        "title": f"제목-{news_id}",
        "category": "경제",
        "published_at": published_at,
        "metadata": {
            "paper_paragraph": paragraph,
            "sub_title": "부제",
            "author_name": "홍길동 기자",
            "url": f"https://www.sedaily.com/NewsView/{news_id}",
        },
    }


def _body(image_url: str = "https://img/x.jpg") -> Dict[str, Any]:
    return {
        "content_ko": "본문 문단1\n\n본문 문단2",
        "content_blocks": [{"type": "text", "text_ko": "본문 문단1"}],
        "images": [{"url": image_url}],
    }


def _install(monkeypatch: pytest.MonkeyPatch, pg: _FakePg, s3: Optional[_FakeS3] = None) -> None:
    monkeypatch.setattr(front_page, "PgVectorV2Client", lambda: pg)
    monkeypatch.setattr(front_page, "S3ArticleV2Client", lambda: s3 or _FakeS3({}))


def _get(date: Optional[str] = None) -> Dict[str, Any]:
    event: Dict[str, Any] = {"httpMethod": "GET"}
    if date:
        event["queryStringParameters"] = {"date": date}
    return event


# =============================================================================
# Tests
# =============================================================================


def test_invalid_date_returns_400(monkeypatch) -> None:
    _install(monkeypatch, _FakePg({}))
    resp = lambda_handler(_get("2026/07/23"), None)
    assert resp["statusCode"] == 400


def test_non_canonical_date_normalized(monkeypatch) -> None:
    # "2026-7-3" 은 strptime 을 통과하지만 비정규 — 정규화되어 canonical 로 응답.
    _install(monkeypatch, _FakePg({}))
    resp = lambda_handler(_get("2026-7-3"), None)
    assert resp["statusCode"] == 200
    assert json.loads(resp["body"])["requested_date"] == "2026-07-03"


def test_direct_hit_no_fallback_sorted_top_first(monkeypatch) -> None:
    pg = _FakePg({"20260723": [
        _row("B-SUB", paragraph="9", published_at="2026-07-22T09:00:00+09:00"),
        _row("A-TOP", paragraph="TOP", published_at="2026-07-22T18:00:00+09:00"),
    ]})
    s3 = _FakeS3({"A-TOP": _body(), "B-SUB": _body()})
    _install(monkeypatch, pg, s3)
    resp = lambda_handler(_get("2026-07-23"), None)
    assert resp["statusCode"] == 200
    payload = json.loads(resp["body"])
    assert payload["paper_date"] == "2026-07-23"
    assert payload["is_fallback"] is False
    assert [a["news_id"] for a in payload["articles"]] == ["A-TOP", "B-SUB"]
    assert payload["articles"][0]["is_top"] is True
    assert payload["articles"][0]["image_url"] == "https://img/x.jpg"
    assert pg.closed is True


def test_weekend_falls_back_to_latest_paper_date(monkeypatch) -> None:
    pg = _FakePg(
        {"20260722": [_row("FRI", paragraph="TOP")]},
        latest="20260722",
    )
    _install(monkeypatch, pg, _FakeS3({"FRI": _body()}))
    resp = lambda_handler(_get("2026-07-23"), None)
    payload = json.loads(resp["body"])
    assert payload["requested_date"] == "2026-07-23"
    assert payload["paper_date"] == "2026-07-22"
    assert payload["is_fallback"] is True


def test_empty_store_returns_empty_articles(monkeypatch) -> None:
    _install(monkeypatch, _FakePg({}, latest=None))
    resp = lambda_handler(_get("2026-07-23"), None)
    payload = json.loads(resp["body"])
    assert payload["articles"] == [] and payload["is_fallback"] is False


def test_s3_miss_keeps_article_in_list_without_body(monkeypatch) -> None:
    pg = _FakePg({"20260723": [_row("NOBODY", paragraph="TOP")]})
    _install(monkeypatch, pg, _FakeS3({"NOBODY": RuntimeError("s3 down")}))
    resp = lambda_handler(_get("2026-07-23"), None)
    a = json.loads(resp["body"])["articles"][0]
    assert a["news_id"] == "NOBODY"
    assert a["content"] == "" and a["content_blocks"] == []
    assert a["url"].endswith("NOBODY")  # 원문 링크는 유지


def test_cache_control_header_on_success(monkeypatch) -> None:
    _install(monkeypatch, _FakePg({}))
    resp = lambda_handler(_get("2026-07-23"), None)
    assert resp["headers"]["Cache-Control"] == "public, max-age=300"


def test_options_returns_200_with_cors(monkeypatch) -> None:
    _install(monkeypatch, _FakePg({}))
    resp = lambda_handler({"httpMethod": "OPTIONS"}, None)
    assert resp["statusCode"] == 200
    assert "Access-Control-Allow-Origin" in resp["headers"]
