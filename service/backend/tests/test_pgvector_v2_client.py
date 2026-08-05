"""Unit tests for ``PgVectorV2Client`` — front-page(지면 1면) 전용.

2026-08-05: 원래 34-메서드 God Object였던 클라이언트가 자동생성 파이프라인
폐기와 함께 front-page 전용으로 축소됐다(``clients/pgvector_v2_client.py``
모듈 docstring 참조). 이 테스트 파일도 같이 축소 — 남은 두 메서드
(``get_front_page_articles``, ``get_latest_front_page_date``)만 커버한다.
"""
from __future__ import annotations

import datetime as _dt

from clients.pgvector_v2_client import PgVectorV2Client


class _FakeConn:
    def __init__(self, rows):
        self.rows = rows
        self.calls = []

    def run(self, sql, **params):
        self.calls.append((sql, params))
        return self.rows


def _client_with_fake_conn(rows):
    c = PgVectorV2Client.__new__(PgVectorV2Client)  # __init__(env) 우회
    c._enabled = True
    c._conn = _FakeConn(rows)
    return c


def test_get_front_page_articles_shapes_rows() -> None:
    published = _dt.datetime(2026, 7, 22, 17, 29, tzinfo=_dt.timezone.utc)
    rows = [
        ["2KF26GAWZP", "폴더블 공개", "경제", published,
         {"paper_paragraph": "TOP", "url": "https://sedaily.com/a"}],
    ]
    c = _client_with_fake_conn(rows)
    out = c.get_front_page_articles("20260723")
    assert out[0]["news_id"] == "2KF26GAWZP"
    assert out[0]["published_at"] == published.isoformat()
    assert out[0]["metadata"]["paper_paragraph"] == "TOP"
    sql, params = c._conn.calls[0]
    assert "paper_number" in sql and params == {"pdate": "20260723"}


def test_get_front_page_articles_parses_string_metadata() -> None:
    rows = [["N1", "t", None, None, '{"url": "u"}']]
    c = _client_with_fake_conn(rows)
    assert c.get_front_page_articles("20260723")[0]["metadata"] == {"url": "u"}


def test_get_front_page_articles_disabled_returns_empty() -> None:
    c = PgVectorV2Client.__new__(PgVectorV2Client)
    c._enabled = False
    c._conn = None
    assert c.get_front_page_articles("20260723") == []


def test_get_latest_front_page_date_returns_scalar() -> None:
    c = _client_with_fake_conn([["20260722"]])
    assert c.get_latest_front_page_date("20260723") == "20260722"
    _, params = c._conn.calls[0]
    assert params == {"ub": "20260723"}


def test_get_latest_front_page_date_none_when_no_rows() -> None:
    c = _client_with_fake_conn([[None]])
    assert c.get_latest_front_page_date("20260723") is None
