"""타임머신 키워드+기간 검색(services/bigkinds_search + 핸들러 q 모드) 단위 테스트.

외부 호출(빅카인즈 HTTP·SSM·DynamoDB)은 전부 mock.
실행: cd service/backend && python3 -m pytest tests/test_time_machine_range_unit.py -q
"""
import json
import time
from unittest.mock import MagicMock

import pytest
import requests

from handlers import time_machine_handler as tm
from services import bigkinds_search as bs
from utils import date_validation as dv


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


def _doc(i, title='IMF 구제금융 신청', published_at='1997-11-21T00:00:00.000+09:00', **kw):
    d = {'news_id': f'n{i}', 'title': title, 'content': '본문입니다', 'byline': ' 홍길동 ',
         'category': ['경제>금융_재테크'], 'provider_link_page': f'https://sed/{i}',
         'published_at': published_at}
    d.update(kw)
    return d


def _resp(docs=None, result=0, reason='', status_ok=True):
    r = MagicMock()
    if status_ok:
        r.raise_for_status.return_value = None
    else:
        err = requests.HTTPError('bad')
        err.response = MagicMock(status_code=400)
        r.raise_for_status.side_effect = err
    r.json.return_value = {'result': result, 'reason': reason,
                           'return_object': {'documents': docs or []}}
    return r


@pytest.fixture(autouse=True)
def env(monkeypatch):
    monkeypatch.setattr(dv, 'today_kst', lambda: '2026-10-04')
    monkeypatch.setattr(tm, 'today_kst', lambda: '2026-10-04')
    monkeypatch.setattr(bs, '_relevance_supported', None)
    monkeypatch.setattr(bs, 'get_secret', lambda name: 'KEY')
    table = _FakeTable()
    monkeypatch.setattr(tm, '_get_table', lambda: table)
    monkeypatch.setattr(tm, 'build_investment_scenarios', lambda date: {'stub': date})
    post = MagicMock(return_value=_resp([_doc(1), _doc(2)]))
    monkeypatch.setattr(bs.requests, 'post', post)
    return table, post


def _ev(**params):
    return {'requestContext': {'http': {'method': 'GET'}}, 'queryStringParameters': params}


def _call(**params):
    res = tm.lambda_handler(_ev(**params), None)
    return res['statusCode'], json.loads(res['body'])


BASE = dict(q='IMF', **{'from': '1997-11-21'}, to='1997-12-31')


def _sorts(post):
    return [c.kwargs['json']['argument']['sort'] for c in post.call_args_list]


# ── 파라미터 검증 ────────────────────────────────────────────────────────────

@pytest.mark.parametrize('override', [
    {'q': ''},
    {'q': '   '},
    {'q': 'x' * 41},
    {'from': None},
    {'to': None},
    {'from': 'bad'},
    {'to': '1997-13-40'},
    {'from': '1989-12-31'},
    {'from': '1997-12-31', 'to': '1997-11-21'},
    {'from': '1990-01-01', 'to': '1996-12-31'},  # 6년 초과
    {'size': '0'},
    {'size': '21'},
    {'size': 'abc'},
    {'sort': 'popular'},
])
def test_invalid_params_400(env, override):
    params = {**BASE, **override}
    params = {k: v for k, v in params.items() if v is not None}
    status, body = _call(**params)
    assert status == 400 and body['code'] == 'BAD_REQUEST'
    env[1].assert_not_called()


def test_valid_params_and_defaults(env):
    status, body = _call(q='  IMF  ', **{'from': '1997-11-21'}, to='1997-12-31')
    assert status == 200
    assert body['query'] == 'IMF' and body['size'] == 10 and body['sort_applied'] == 'relevance'
    arg = env[1].call_args.kwargs['json']['argument']
    assert arg['query'] == 'IMF' and arg['return_size'] == 10
    assert arg['published_at'] == {'from': '1997-11-21', 'until': '1998-01-01'}  # to 다음날(배타)
    assert arg['provider'] == ['서울경제'] and 'published_at' in arg['fields']


def test_max_size_and_exact_six_years_ok(env):
    status, body = _call(q='x', **{'from': '1990-01-01'}, to='1995-12-31', size='20')
    assert status == 200 and body['size'] == 20


def test_future_dates_clamped_to_today(env):
    status, body = _call(q='x', **{'from': '2026-01-01'}, to='2099-01-01')
    assert status == 200 and body['to'] == '2026-10-04'


def test_empty_q_param_is_range_mode_400(env):
    # q 키가 있으면(빈 값이어도) 기간 모드 → date 모드로 새지 않는다.
    status, _ = _call(q='', date='2026-10-01')
    assert status == 400


# ── 응답 스키마 ──────────────────────────────────────────────────────────────

def test_response_schema(env):
    status, body = _call(**BASE)
    assert set(body) == {'query', 'from', 'to', 'size', 'sort_applied', 'articles', 'cached'}
    assert body['from'] == '1997-11-21' and body['to'] == '1997-12-31' and body['cached'] is False
    a = body['articles'][0]
    assert set(a) == {'news_id', 'title', 'content', 'byline', 'category', 'original_link', 'published_at'}
    assert a['published_at'] == '1997-11-21' and a['byline'] == '홍길동' and a['category'] == '경제'


def test_published_at_omitted_when_missing(env):
    env[1].return_value = _resp([_doc(1, published_at=None)])
    _, body = _call(**BASE)
    assert 'published_at' not in body['articles'][0]


# ── relevance → date 대체 ────────────────────────────────────────────────────

def test_relevance_success_remembered(env):
    _, post = env
    _, body = _call(**BASE)
    assert body['sort_applied'] == 'relevance' and _sorts(post) == [{'_score': 'desc'}]
    assert bs._relevance_supported is True


def test_relevance_rejected_falls_back_to_date(env):
    _, post = env
    post.side_effect = [_resp(result=-1, reason='bad sort'), _resp([_doc(1)])]
    status, body = _call(**BASE)
    assert status == 200 and body['sort_applied'] == 'date'
    assert _sorts(post) == [{'_score': 'desc'}, {'date': 'desc'}]
    assert bs._relevance_supported is False


def test_relevance_http_4xx_also_falls_back(env):
    _, post = env
    post.side_effect = [_resp(status_ok=False), _resp([_doc(1)])]
    _, body = _call(**BASE)
    assert body['sort_applied'] == 'date'


def test_unsupported_remembered_no_retry(env):
    _, post = env
    post.side_effect = [_resp(result=-1), _resp([_doc(1)]), _resp([_doc(2)])]
    _call(**BASE)
    post.reset_mock()
    post.side_effect = None
    post.return_value = _resp([_doc(3)])
    _, body = _call(q='다른키워드', **{'from': '1997-11-21'}, to='1997-12-31')
    assert body['sort_applied'] == 'date' and _sorts(post) == [{'date': 'desc'}]


def test_sort_date_requested_never_tries_score(env):
    _, post = env
    _, body = _call(sort='date', **BASE)
    assert body['sort_applied'] == 'date' and _sorts(post) == [{'date': 'desc'}]
    assert bs._relevance_supported is None


def test_both_attempts_fail_is_502_and_not_remembered(env):
    _, post = env
    post.side_effect = [_resp(result=-1, reason='secret-detail'), _resp(result=-1, reason='secret-detail')]
    status, body = _call(**BASE)
    assert status == 502 and body['code'] == 'BIGKINDS_ERROR'
    assert 'secret-detail' not in json.dumps(body)
    assert bs._relevance_supported is None
    assert env[0].puts == []


def test_timeout_is_502_without_fallback(env):
    _, post = env
    post.side_effect = requests.Timeout('slow')
    status, body = _call(**BASE)
    assert status == 502 and post.call_count == 1


# ── 캐시 ─────────────────────────────────────────────────────────────────────

def test_cache_miss_then_hit(env):
    table, post = env
    first = _call(**BASE)[1]
    second = _call(**BASE)[1]
    assert first['cached'] is False and second['cached'] is True
    assert post.call_count == 1
    assert second['articles'] == first['articles'] and second['sort_applied'] == first['sort_applied']
    put = table.puts[0]
    assert put['news_id'].startswith('timemachine_range_') and len(put['news_id']) == len('timemachine_range_') + 40
    assert isinstance(put['expires_at'], int)
    assert 30 * 86400 - 5 < put['expires_at'] - time.time() <= 30 * 86400


def test_cache_key_differs_by_param_and_never_collides_with_day_keys(env):
    table, _ = env
    _call(**BASE)
    _call(size='5', **BASE)
    _call(sort='date', **BASE)
    keys = {p['news_id'] for p in table.puts}
    assert len(keys) == 3
    assert not any(k.startswith(('timemachine_articles_', 'timemachine_empty_')) for k in keys)


def test_fallback_result_cached_with_sort_applied(env):
    table, post = env
    post.side_effect = [_resp(result=-1), _resp([_doc(1)])]
    _call(**BASE)
    again = _call(**BASE)[1]
    assert again['cached'] is True and again['sort_applied'] == 'date'


def test_negative_cache_for_past_range(env):
    table, post = env
    post.return_value = _resp([])
    first = _call(**BASE)[1]
    assert first['articles'] == [] and first['cached'] is False
    put = table.puts[0]
    assert put['news_id'].startswith('timemachine_range_empty_')
    assert tm.NEGATIVE_CACHE_TTL_SECONDS - 5 < put['expires_at'] - time.time() <= tm.NEGATIVE_CACHE_TTL_SECONDS
    second = _call(**BASE)[1]
    assert second['cached'] is True and second['articles'] == [] and post.call_count == 1


def test_negative_cache_expired_refetches(env):
    table, post = env
    post.return_value = _resp([])
    _call(**BASE)
    for item in table.items.values():
        item['expires_at'] = 1
    _call(**BASE)
    assert post.call_count == 2


def test_no_negative_cache_when_range_includes_today(env):
    table, post = env
    post.return_value = _resp([])
    _call(q='x', **{'from': '2026-10-01'}, to='2026-10-04')
    assert table.puts == []


def test_positive_cache_saved_even_when_range_includes_today(env):
    table, _ = env
    _call(q='x', **{'from': '2026-10-01'}, to='2026-10-04')
    assert len(table.puts) == 1


def test_error_never_cached(env):
    table, post = env
    post.side_effect = requests.ConnectionError('down')
    assert _call(**BASE)[0] == 502
    assert table.puts == []


def test_cache_read_failure_is_ignored(env, monkeypatch):
    monkeypatch.setattr(tm, '_get_table', MagicMock(side_effect=RuntimeError('ddb down')))
    status, body = _call(**BASE)
    assert status == 200 and body['cached'] is False


# ── 기존 date 모드 회귀 ──────────────────────────────────────────────────────

def test_day_mode_payload_unchanged(env):
    _, post = env
    post.return_value = _resp([_doc(1), _doc(2, title='[부고] 홍길동씨 별세')])
    status, body = _call(date='2026-10-01')
    assert status == 200 and set(body) == {'date', 'articles', 'investments', 'cached'}
    assert post.call_args.kwargs['timeout'] == 15
    assert post.call_args.args[0] == 'https://tools.kinds.or.kr/search/news'
    assert post.call_args.kwargs['json'] == {
        'access_key': 'KEY',
        'argument': {
            'query': '',
            'published_at': {'from': '2026-10-01', 'until': '2026-10-02'},
            'provider': ['서울경제'],
            'sort': {'date': 'desc'},
            'return_from': 0,
            'return_size': 30,
            'fields': ['title', 'content', 'byline', 'category', 'provider_link_page'],
        },
    }
    assert [a['news_id'] for a in body['articles']] == ['n1']  # 제외 마커 적용
    assert set(body['articles'][0]) == {'news_id', 'title', 'content', 'byline', 'category', 'original_link'}


def test_day_mode_cache_keys_unchanged(env):
    table, _ = env
    _call(date='2026-10-01')
    assert table.puts[0]['news_id'] == 'timemachine_articles_2026-10-01'


def test_day_mode_bigkinds_error_502(env):
    _, post = env
    post.return_value = _resp(result=-1, reason='boom')
    status, body = _call(date='2026-10-01')
    assert status == 502 and 'boom' not in json.dumps(body)


def test_day_mode_missing_date_400(env):
    assert _call()[0] == 400


def test_content_preview_cleanup():
    long = '가' * 200
    assert bs._clean_content_preview(long) == '가' * 150 + '…'
    assert bs._clean_content_preview('본문\n\n입력시간 : 1997/11/21 10:30') == '본문'
