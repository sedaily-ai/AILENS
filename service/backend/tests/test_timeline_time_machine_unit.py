"""타임라인(S3 XML)·타임머신(빅카인즈) 단위 테스트 — 외부 호출은 전부 mock.

실행: cd service/backend && python3 -m pytest tests/test_timeline_time_machine_unit.py -q
"""
import json
import time
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest

from handlers.timeline import time_machine as tm
from handlers.timeline import timeline as th
from services.timeline import timeline as ts
from common.dates import validation as dv


# ── 공용 픽스처 ──────────────────────────────────────────────────────────────

def _article(nsid, title, published_at, category='경제', action='I', content='본문', press='서울경제'):
    return SimpleNamespace(
        nsid=nsid, title=title, published_at=published_at, main_category=category,
        action=action, content_clean=content, press=press, author_name='홍길동',
        url=f'https://sedaily.com/{nsid}', images=[], content_images=[],
    )


class _FakeS3Client:
    def __init__(self, articles):
        self.articles = articles
        self.calls = []

    async def get_articles_by_date(self, date_str):
        self.calls.append(date_str)
        return list(self.articles)


@pytest.fixture(autouse=True)
def _clean_state(monkeypatch):
    ts._day_cache.clear()
    monkeypatch.setattr(dv, 'today_kst', lambda: '2026-10-04')
    monkeypatch.setattr(ts, 'today_kst', lambda: '2026-10-04')
    monkeypatch.setattr(tm, 'today_kst', lambda: '2026-10-04')  # tm은 이름으로 import해 위 패치가 닿지 않음
    yield
    ts._day_cache.clear()


def _use_fake_s3(monkeypatch, articles):
    fake = _FakeS3Client(articles)
    monkeypatch.setattr(ts, '_get_s3_xml_client', lambda: fake)
    return fake


SAMPLE = [
    _article('a1', '금리 동결', '2026-10-01T09:00:00', '경제', content='한국은행이 금리를 동결'),
    _article('a2', '반도체 호조', '2026-10-01T11:00:00', '산업', content='수출 증가'),
    _article('a3', '삭제된 기사', '2026-10-01T12:00:00', '경제', action='D'),
    _article('a4', '부동산 대책', '2026-10-01T10:00:00', '경제', content='금리 영향'),
]


# ── 날짜 검증 ────────────────────────────────────────────────────────────────

def test_validate_date_ok():
    assert dv.validate_date('2026-10-01') == '2026-10-01'


def test_validate_date_future_clamped_to_today():
    assert dv.validate_date('2030-01-01') == '2026-10-04'


@pytest.mark.parametrize('raw', ['', '2026/10/01', '20261001', 'abc', '2026-13-40'])
def test_validate_date_bad_format(raw):
    with pytest.raises(dv.BadRequest):
        dv.validate_date(raw)


def test_validate_date_before_min():
    with pytest.raises(dv.BadRequest):
        dv.validate_date('1989-12-31', min_date=tm.BIGKINDS_MIN_DATE)
    assert dv.validate_date('1990-01-01', min_date=tm.BIGKINDS_MIN_DATE) == '1990-01-01'


def test_handlers_share_one_badrequest():
    assert th.BadRequest is tm.BadRequest is dv.BadRequest


# ── timeline_service: 필터/정렬/페이지 ───────────────────────────────────────

def _req(**kw):
    return ts.TimelineRequest(date=kw.pop('date', '2026-10-01'), **kw)


def test_timeline_sorted_desc_and_deleted_excluded(monkeypatch):
    _use_fake_s3(monkeypatch, SAMPLE)
    out = ts.build_timeline(_req())
    assert [a['news_id'] for a in out['articles']] == ['a2', 'a4', 'a1']
    assert out['total_hits'] == 3


def test_timeline_category_filter(monkeypatch):
    _use_fake_s3(monkeypatch, SAMPLE)
    out = ts.build_timeline(_req(categories=['산업']))
    assert [a['news_id'] for a in out['articles']] == ['a2']


def test_timeline_query_matches_title_or_content(monkeypatch):
    _use_fake_s3(monkeypatch, SAMPLE)
    out = ts.build_timeline(_req(query='금리'))
    assert {a['news_id'] for a in out['articles']} == {'a1', 'a4'}


def test_timeline_pagination(monkeypatch):
    _use_fake_s3(monkeypatch, SAMPLE)
    out = ts.build_timeline(_req(page=2, page_size=2))
    assert [a['news_id'] for a in out['articles']] == ['a1']
    assert out['total_pages'] == 2 and out['page'] == 2


def test_timeline_response_schema(monkeypatch):
    _use_fake_s3(monkeypatch, SAMPLE)
    out = ts.build_timeline(_req())
    assert set(out) == {'source', 'total_hits', 'articles', 'date', 'query', 'categories',
                        'page', 'page_size', 'total_pages', 'mode'}
    assert out['source'] == 's3_xml' and out['mode'] == 'flat'
    assert set(out['articles'][0]) == {'news_id', 'title', 'published_at', 'category', 'provider',
                                       'byline', 'original_link', 'content', 'image_url'}


def test_timeline_empty_day(monkeypatch):
    _use_fake_s3(monkeypatch, [])
    out = ts.build_timeline(_req())
    assert out['articles'] == [] and out['total_hits'] == 0 and out['total_pages'] == 0


# ── timeline_service: 메모리 캐시 ────────────────────────────────────────────

def test_s3_not_refetched_for_same_date(monkeypatch):
    fake = _use_fake_s3(monkeypatch, SAMPLE)
    ts.build_timeline(_req(page=1))
    ts.build_timeline(_req(page=2, page_size=1))
    ts.build_timeline(_req(query='금리'))
    assert fake.calls == ['20261001']


def test_cache_ttl_past_vs_today_vs_empty(monkeypatch):
    now = [1000.0]
    monkeypatch.setattr(ts.time, 'monotonic', lambda: now[0])
    fake = _use_fake_s3(monkeypatch, SAMPLE)

    ts.build_timeline(_req(date='2026-10-04'))   # 오늘: 60초
    now[0] += ts.TODAY_TTL_SECONDS - 1
    ts.build_timeline(_req(date='2026-10-04'))
    assert len(fake.calls) == 1
    now[0] += 2
    ts.build_timeline(_req(date='2026-10-04'))
    assert len(fake.calls) == 2

    ts.build_timeline(_req(date='2026-10-01'))   # 과거: 1시간
    now[0] += ts.PAST_DATE_TTL_SECONDS - 1
    ts.build_timeline(_req(date='2026-10-01'))
    assert len(fake.calls) == 3
    now[0] += 2
    ts.build_timeline(_req(date='2026-10-01'))
    assert len(fake.calls) == 4


def test_empty_result_cached_only_briefly(monkeypatch):
    now = [0.0]
    monkeypatch.setattr(ts.time, 'monotonic', lambda: now[0])
    fake = _use_fake_s3(monkeypatch, [])
    ts.build_timeline(_req())
    ts.build_timeline(_req())
    assert len(fake.calls) == 1
    now[0] += ts.EMPTY_TTL_SECONDS + 1
    ts.build_timeline(_req())
    assert len(fake.calls) == 2


def test_cache_lru_bound(monkeypatch):
    fake = _use_fake_s3(monkeypatch, SAMPLE)
    for d in range(1, ts.MAX_CACHED_DATES + 3):
        ts.build_timeline(_req(date=f'2026-09-{d:02d}'))
    assert len(ts._day_cache._data) == ts.MAX_CACHED_DATES
    n = len(fake.calls)
    ts.build_timeline(_req(date='2026-09-01'))   # 가장 오래된 날짜는 쫓겨났다
    assert len(fake.calls) == n + 1


# ── timeline_handler: 요청 파싱/오류 규약 ────────────────────────────────────

def _post(body):
    return {'requestContext': {'http': {'method': 'POST'}}, 'body': json.dumps(body)}


def test_handler_rejects_non_flat_mode():
    res = th.lambda_handler(_post({'date': '2026-10-01', 'mode': 'issues'}), None)
    assert res['statusCode'] == 400
    assert json.loads(res['body'])['code'] == 'BAD_REQUEST'


def test_handler_bad_date_400():
    res = th.lambda_handler(_post({'date': 'nope'}), None)
    assert res['statusCode'] == 400


def test_handler_ok_flat(monkeypatch):
    _use_fake_s3(monkeypatch, SAMPLE)
    res = th.lambda_handler(_post({'date': '2026-10-01', 'mode': 'flat', 'page_size': 2}), None)
    body = json.loads(res['body'])
    assert res['statusCode'] == 200 and len(body['articles']) == 2


def test_handler_internal_error_not_leaked(monkeypatch):
    def boom(_req):
        raise RuntimeError('secret-internal-detail')
    monkeypatch.setattr(th, 'build_timeline', boom)
    res = th.lambda_handler(_post({'date': '2026-10-01'}), None)
    body = json.loads(res['body'])
    assert res['statusCode'] == 500 and body['code'] == 'TIMELINE_ERROR'
    assert 'secret-internal-detail' not in res['body']


# ── time_machine: DynamoDB 캐시(히트/미스/부정 캐시) ─────────────────────────

class _FakeTable:
    def __init__(self):
        self.items = {}
        self.puts = []

    def get_item(self, Key):
        item = self.items.get(Key['news_id'])
        return {'Item': item} if item else {}

    def put_item(self, Item):
        self.puts.append(Item)
        self.items[Item['news_id']] = Item


@pytest.fixture
def tm_env(monkeypatch):
    table = _FakeTable()
    monkeypatch.setattr(tm, '_get_table', lambda: table)
    monkeypatch.setattr(tm, 'build_investment_scenarios', lambda date: {'stub': date})
    fetch = MagicMock(return_value=[{'news_id': 'n1', 'title': 't', 'content': 'c',
                                     'byline': 'b', 'category': '경제', 'original_link': None}])
    monkeypatch.setattr(tm, '_fetch_sedaily_articles', fetch)
    return table, fetch


def test_tm_miss_then_hit(tm_env):
    table, fetch = tm_env
    first = tm.get_time_machine_data('2026-10-01')
    assert first['cached'] is False and len(first['articles']) == 1
    second = tm.get_time_machine_data('2026-10-01')
    assert second['cached'] is True and fetch.call_count == 1
    assert set(second) == {'date', 'articles', 'investments', 'cached'}


def test_tm_expires_at_is_epoch_number(tm_env):
    table, _ = tm_env
    tm.get_time_machine_data('2026-10-01')
    exp = table.puts[0]['expires_at']
    assert isinstance(exp, int) and exp > 1_700_000_000
    assert table.puts[0]['news_id'] == 'timemachine_articles_2026-10-01'  # 기존 키 접두사 유지


def test_tm_legacy_string_expires_at_still_hits(tm_env):
    table, fetch = tm_env
    table.items['timemachine_articles_2026-10-01'] = {
        'news_id': 'timemachine_articles_2026-10-01',
        'data': {'date': '2026-10-01', 'articles': [{'news_id': 'old'}]},
        'expires_at': '2036-10-01T00:00:00+09:00',
    }
    out = tm.get_time_machine_data('2026-10-01')
    assert out['cached'] is True and out['articles'][0]['news_id'] == 'old'
    fetch.assert_not_called()


def test_tm_negative_cache(tm_env):
    table, fetch = tm_env
    fetch.return_value = []
    first = tm.get_time_machine_data('2026-10-01')
    assert first['articles'] == [] and first['cached'] is False
    assert table.puts[0]['news_id'] == 'timemachine_empty_2026-10-01'
    remaining = table.puts[0]['expires_at'] - time.time()
    assert tm.NEGATIVE_CACHE_TTL_SECONDS - 5 < remaining <= tm.NEGATIVE_CACHE_TTL_SECONDS
    second = tm.get_time_machine_data('2026-10-01')
    assert second['cached'] is True and second['articles'] == []
    assert fetch.call_count == 1


def test_tm_negative_cache_expired_refetches(tm_env):
    table, fetch = tm_env
    fetch.return_value = []
    tm.get_time_machine_data('2026-10-01')
    table.items['timemachine_empty_2026-10-01']['expires_at'] = 1  # 만료(TTL 삭제 지연 가정)
    tm.get_time_machine_data('2026-10-01')
    assert fetch.call_count == 2


def test_tm_no_negative_cache_for_today(tm_env):
    table, fetch = tm_env
    fetch.return_value = []
    tm.get_time_machine_data('2026-10-04')
    assert table.puts == []


def test_tm_error_is_never_cached(tm_env):
    table, fetch = tm_env
    fetch.side_effect = RuntimeError('bigkinds down')
    with pytest.raises(RuntimeError):
        tm.get_time_machine_data('2026-10-01')
    assert table.puts == []


def test_tm_negative_item_alone_is_hit(tm_env):
    table, fetch = tm_env
    table.items['timemachine_empty_2026-10-01'] = {'expires_at': 9_999_999_999}
    fetch.return_value = [{'news_id': 'n1'}]
    # 정상 캐시가 없고 부정 캐시만 있으면 히트(0건)
    assert tm.get_time_machine_data('2026-10-01')['articles'] == []
    fetch.assert_not_called()


# ── time_machine 핸들러: 오류 규약 ───────────────────────────────────────────

def _get(date):
    return {'requestContext': {'http': {'method': 'GET'}}, 'queryStringParameters': {'date': date}}


def test_tm_handler_empty_is_200(tm_env):
    _, fetch = tm_env
    fetch.return_value = []
    res = tm.lambda_handler(_get('2026-10-01'), None)
    body = json.loads(res['body'])
    assert res['statusCode'] == 200 and body['articles'] == []


def test_tm_handler_bigkinds_error_is_502_without_detail(tm_env):
    _, fetch = tm_env
    fetch.side_effect = RuntimeError('secret key=abc')
    res = tm.lambda_handler(_get('2026-10-01'), None)
    body = json.loads(res['body'])
    assert res['statusCode'] == 502 and body['code'] == 'BIGKINDS_ERROR'
    assert 'secret' not in res['body']


def test_tm_handler_validation(tm_env):
    assert tm.lambda_handler(_get('1989-01-01'), None)['statusCode'] == 400
    assert tm.lambda_handler(_get('bad'), None)['statusCode'] == 400
    assert tm.lambda_handler(_get('2099-01-01'), None)['statusCode'] == 200  # 미래 → 오늘
