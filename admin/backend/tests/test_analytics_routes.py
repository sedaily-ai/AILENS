"""GET /admin/analytics/summary — 홈 "독자 반응" (2026-11-12).

BigQuery 없이 ga4_repo 함수를 가짜로 바꿔 라우트의 조립·판정 규칙만 검증한다.

Run from repo root::

    python3 -m pytest admin/backend/tests/test_analytics_routes.py -q
"""
from __future__ import annotations

import datetime as dt
import json

import pytest

from routes import analytics
from shared import bigquery_client


@pytest.fixture(autouse=True)
def _no_cache(monkeypatch):
    monkeypatch.setattr(analytics, "_cache", None)


def _wire(monkeypatch, *, latest=dt.date(2026, 11, 10)):
    calls: dict = {}

    def fake_latest():
        return latest

    def fake_eng(cur, prev):
        calls["eng"] = (cur, prev)
        return [
            {"period": "cur", "sessions": 100, "users": 80, "median_engaged_sec": 5.04, "pages_per_session": 1.876,
             "article_sessions": 50, "multi_article_sessions": 5, "article_reads": 60, "read_to_end": 6,
             "returning_users": 8},
            {"period": "prev", "sessions": 0, "users": 0, "median_engaged_sec": None, "pages_per_session": None,
             "article_sessions": 0, "multi_article_sessions": 0, "article_reads": 0, "read_to_end": 0,
             "returning_users": 0},
        ]

    def fake_ret(cur, prev):
        calls["ret"] = (cur, prev)
        return [{"period": "cur", "new_users": 200, "returned_7d": 5}]

    def fake_articles(date_from, date_to, min_reads):
        calls["art"] = (date_from, date_to, min_reads)
        return [
            {"path": "/a/2026/11/01/x", "title": "잘 읽힌 기사 | AI LENS", "reads": 20, "read_to_end": 10, "median_engaged_sec": 30.0},
            {"path": "/a/2026/11/01/y", "title": "금방 나간 기사", "reads": 40, "read_to_end": 0, "median_engaged_sec": 0.0},
            {"path": "/a/2026/11/01/z", "title": None, "reads": 10, "read_to_end": 2, "median_engaged_sec": 8.0},
        ]

    def fake_sources(date_from, date_to):
        return [{"source": "chatgpt.com", "medium": "ai-assistant", "users": 10, "multi_day_users": 1}]

    def fake_webtoon(date_from, date_to):
        return [
            {"variant": "(none)", "starts": 3, "completes": 1},
            {"variant": "v1", "starts": 10, "completes": 6},
        ]

    monkeypatch.setattr(analytics.ga4_repo, "latest_export_date", fake_latest)
    monkeypatch.setattr(analytics.ga4_repo, "engagement_by_period", fake_eng)
    monkeypatch.setattr(analytics.ga4_repo, "week_retention", fake_ret)
    monkeypatch.setattr(analytics.ga4_repo, "article_stats", fake_articles)
    monkeypatch.setattr(analytics.ga4_repo, "source_stats", fake_sources)
    monkeypatch.setattr(analytics.ga4_repo, "webtoon_completion", fake_webtoon)
    monkeypatch.setattr(analytics.ga4_repo, "article_breakdowns", lambda a, b: [
        {"dim": "section", "k": "industry", "reads": 10, "read_to_end": 1, "median_engaged_sec": 11.36},
        {"dim": "section", "k": "markets", "reads": 20, "read_to_end": 0, "median_engaged_sec": None},
        {"dim": "bogus", "k": "x", "reads": 1, "read_to_end": 0, "median_engaged_sec": 1.0},
    ])
    monkeypatch.setattr(analytics.ga4_repo, "landing_stats", lambda a, b: [
        {"k": "home", "sessions": 10, "one_page": 5, "pages_per_session": 7.62},
        {"k": "article", "sessions": 90, "one_page": 81, "pages_per_session": 1.5},
    ])
    monkeypatch.setattr(analytics.ga4_repo, "hourly_sessions", lambda a, b: [{"hour": 9, "sessions": 5}, {"hour": 30, "sessions": 1}])
    monkeypatch.setattr(analytics.ga4_repo, "feature_usage", lambda a, b: [
        {"k": "_all", "sessions": 200}, {"k": "post_vote", "sessions": 10}, {"k": "format_switch", "sessions": 20},
    ])
    return calls


def _body(resp: dict) -> dict:
    return json.loads(resp["body"])


def test_summary_windows_are_anchored_on_latest_export(monkeypatch):
    calls = _wire(monkeypatch)
    resp = analytics.handle_summary({}, {}, {})
    assert resp["statusCode"] == 200
    body = _body(resp)

    assert body["as_of"] == "2026-11-10"
    assert calls["eng"] == ((dt.date(2026, 11, 4), dt.date(2026, 11, 10)), (dt.date(2026, 10, 28), dt.date(2026, 11, 3)))
    # 재방문 묶음은 첫 방문 뒤 7일이 다 지난 것끼리
    assert calls["ret"] == ((dt.date(2026, 10, 28), dt.date(2026, 11, 3)), (dt.date(2026, 10, 21), dt.date(2026, 10, 27)))
    assert calls["art"] == (dt.date(2026, 10, 12), dt.date(2026, 11, 10), analytics.ARTICLE_MIN_READS)


def test_summary_rates_and_empty_period(monkeypatch):
    _wire(monkeypatch)
    body = _body(analytics.handle_summary({}, {}, {}))

    cur = body["engagement"]["cur"]
    assert cur["read_to_end_rate"] == 10.0
    assert cur["multi_article_rate"] == 10.0
    assert cur["returning_rate"] == 10.0
    assert cur["pages_per_session"] == 1.88
    # 분모 0 이면 비율은 None (0% 로 오해하지 않게)
    assert body["engagement"]["prev"]["read_to_end_rate"] is None
    assert body["retention"]["cur"]["rate"] == 2.5
    assert body["retention"]["prev"] is None


def test_articles_rank_and_title_cleanup(monkeypatch):
    _wire(monkeypatch)
    arts = _body(analytics.handle_summary({}, {}, {}))["articles"]
    # 끝까지 읽은 비율 높은 순: x(50%) → z(20%) → y(0%)
    assert [a["path"] for a in arts["top"]] == ["/a/2026/11/01/x", "/a/2026/11/01/z", "/a/2026/11/01/y"]
    assert arts["top"][0]["title"] == "잘 읽힌 기사"  # " | AI LENS" 꼬리 제거
    assert arts["top"][1]["title"] == "/a/2026/11/01/z"  # 제목이 없으면 경로로
    # top 에 들어간 기사는 bottom 에 중복으로 나오지 않는다(기사 3개뿐이라 bottom 은 비어 있음)
    assert arts["bottom"] == []
    assert arts["count"] == 3


def test_webtoon_only_known_variants(monkeypatch):
    _wire(monkeypatch)
    wt = _body(analytics.handle_summary({}, {}, {}))["webtoon"]
    assert wt == [{"variant": "v1", "starts": 10, "completes": 6, "rate": 60.0}]


def test_detail_breakdowns(monkeypatch):
    _wire(monkeypatch)
    body = _body(analytics.handle_summary({}, {}, {}))
    # 많이 읽힌 순 정렬, 모르는 dim 은 버림
    assert [s["k"] for s in body["breakdowns"]["section"]] == ["markets", "industry"]
    assert body["breakdowns"]["section"][1] == {"k": "industry", "reads": 10, "read_to_end_rate": 10.0, "median_engaged_sec": 11.4}
    assert "bogus" not in body["breakdowns"]
    assert body["landing"][0] == {"k": "article", "sessions": 90, "one_page_rate": 90.0, "pages_per_session": 1.5}
    assert len(body["hourly"]) == 24 and body["hourly"][9] == 5 and sum(body["hourly"]) == 5
    assert body["features"]["total_sessions"] == 200
    assert body["features"]["items"][0] == {"k": "format_switch", "sessions": 20, "rate": 10.0}


def test_summary_is_cached(monkeypatch):
    _wire(monkeypatch)
    analytics.handle_summary({}, {}, {})

    def boom():
        raise AssertionError("cache should be used")

    monkeypatch.setattr(analytics.ga4_repo, "latest_export_date", boom)
    assert analytics.handle_summary({}, {}, {})["statusCode"] == 200


def test_bigquery_error_is_502(monkeypatch):
    def fail():
        raise bigquery_client.BigQueryError("HTTP 403: Access Denied")

    monkeypatch.setattr(analytics.ga4_repo, "latest_export_date", fail)
    resp = analytics.handle_summary({}, {}, {})
    assert resp["statusCode"] == 502
    assert analytics._cache is None


def test_no_export_tables_is_503(monkeypatch):
    _wire(monkeypatch, latest=None)
    assert analytics.handle_summary({}, {}, {})["statusCode"] == 503


@pytest.mark.parametrize(
    "source,medium,expected",
    [
        ("(direct)", "(none)", "직접 접속"),
        ("google", "organic", "검색 · google"),
        ("chatgpt.com", "ai-assistant", "AI 검색 · chatgpt.com"),
        ("chatgpt.com", "referral", "다른 사이트 · chatgpt.com"),  # t.co 부분 일치로 SNS가 되면 안 된다
        ("t.co", "referral", "SNS·메신저 · t.co"),
        ("talk.kakao.com", "referral", "SNS·메신저 · talk.kakao.com"),
        ("m.sedaily.com", "referral", "서울경제 · m.sedaily.com"),
        ("newsletter", "email", "newsletter / email"),
    ],
)
def test_channel_label(source, medium, expected):
    assert analytics.channel_label(source, medium) == expected


def test_rows_from_response_converts_types():
    resp = {
        "schema": {"fields": [
            {"name": "n", "type": "INTEGER"}, {"name": "f", "type": "FLOAT"},
            {"name": "s", "type": "STRING"}, {"name": "b", "type": "BOOLEAN"}, {"name": "x", "type": "FLOAT"},
        ]},
        "rows": [{"f": [{"v": "3"}, {"v": "1.5"}, {"v": "가"}, {"v": "true"}, {"v": None}]}],
    }
    assert bigquery_client.rows_from_response(resp) == [{"n": 3, "f": 1.5, "s": "가", "b": True, "x": None}]
