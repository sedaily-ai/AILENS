"""타임머신 '그날의 1면' 모드(handlers.timeline.time_machine front 파라미터 + bigkinds_search.search_front_page) 단위 테스트.
외부 호출(빅카인즈 HTTP·SSM·DynamoDB)은 전부 mock.
실행: cd service/backend && python3 -m pytest tests/test_time_machine_front_unit.py -q
"""
import json
from unittest.mock import MagicMock

import pytest

from handlers.timeline import time_machine as tm
from services.timeline import bigkinds_search as bs
from common.dates import validation as dv


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


def _doc(i, page='1', sent='2019-10-08T17:11:00.000+09:00', content='본문', title=None):
    return {'news_id': f'n{i}', 'title': title or f'기사 {i}', 'content': content, 'byline': '홍길동',
            'category': ['경제>산업_기업'], 'provider_link_page': f'https://sed/{i}',
            'printing_page': page, 'enveloped_at': sent}


def _resp(docs):
    r = MagicMock()
    r.raise_for_status.return_value = None
    r.json.return_value = {'result': 0, 'return_object': {'documents': docs}}
    return r


@pytest.fixture
def env(monkeypatch):
    monkeypatch.setattr(dv, 'today_kst', lambda: '2026-10-19')
    monkeypatch.setattr(tm, 'today_kst', lambda: '2026-10-19')
    monkeypatch.setattr(bs, 'get_secret', lambda name: 'KEY')
    table = _FakeTable()
    monkeypatch.setattr(tm, '_get_table', lambda: table)
    post = MagicMock(return_value=_resp([]))
    monkeypatch.setattr(bs.requests, 'post', post)
    return table, post


def _call(**params):
    event = {'requestContext': {'http': {'method': 'GET'}}, 'queryStringParameters': params}
    res = tm.lambda_handler(event, None)
    return res['statusCode'], json.loads(res['body'])


def test_picks_page_one_sent_between_previous_noon_and_print_noon(env):
    _, post = env
    post.return_value = _resp([
        _doc(1, sent='2019-10-08T17:11:00.000+09:00', content='짧음'),
        _doc(2, sent='2019-10-08T23:15:00.000+09:00', content='가장 긴 본문입니다'),
        _doc(3, sent='2019-10-09T17:07:00.000+09:00'),          # 다음 날 신문(인쇄일 정오 이후 송고)
        _doc(4, sent='2019-10-08T06:01:00.000+09:00'),          # 전날 신문(전날 정오 이전 송고)
        _doc(5, page='2', sent='2019-10-08T18:00:00.000+09:00'),  # 2면
        _doc(6, page='0', sent='2019-10-08T18:00:00.000+09:00'),  # 온라인 기사
        _doc(7, title='[사설] 제외되는 코너', sent='2019-10-08T18:00:00.000+09:00'),
    ])
    status, body = _call(front='2019-10-09')
    assert status == 200
    assert body['status'] == 'ok' and body['reason'] is None
    assert [a['news_id'] for a in body['articles']] == ['n2', 'n1']  # 본문 길이 순
    assert set(body['articles'][0]) == {'news_id', 'title', 'content', 'byline', 'category', 'original_link'}
    argument = post.call_args.kwargs['json']['argument']
    assert argument['published_at'] == {'from': '2019-10-08', 'until': '2019-10-10'}
    assert 'printing_page' in argument['fields'] and 'enveloped_at' in argument['fields']
    assert argument['return_size'] == bs.FRONT_PAGE_FETCH_SIZE
    assert post.call_args.kwargs['timeout'] == bs.FRONT_PAGE_TIMEOUT_SECONDS


def test_1990s_use_published_date_and_ignore_archive_send_time(env):
    _, post = env
    # 1990년대 송고 시각은 보관 작업 시각이라 인쇄일과 맞지 않아도 그날 기사로 본다.
    post.return_value = _resp([_doc(1, sent='1996-06-01T15:00:00.000+09:00'), _doc(2, page='5')])
    _, body = _call(front='1996-06-01')
    assert [a['news_id'] for a in body['articles']] == ['n1']
    assert post.call_args.kwargs['json']['argument']['published_at'] == {'from': '1996-06-01', 'until': '1996-06-02'}


def test_sunday_after_closure_is_no_paper_without_bigkinds_call(env):
    _, post = env
    _, body = _call(front='2000-03-19')
    assert body == {'date': '2000-03-19', 'status': 'no_paper', 'reason': 'sunday', 'articles': [], 'cached': False}
    _, body = _call(front='2018-03-11')
    assert body['reason'] == 'sunday'
    post.assert_not_called()


def test_sunday_before_closure_is_fetched(env):
    _, post = env
    post.return_value = _resp([_doc(1, sent='1996-06-02T01:00:00.000+09:00')])
    _, body = _call(front='1996-06-02')
    assert body['status'] == 'ok'
    post.assert_called_once()


@pytest.mark.parametrize('date', ['1990-01-02', '1993-12-31', '1996-08-01', '2005-03-15', '2017-11-11'])
def test_dates_without_page_numbers_are_not_fetched(env, date):
    _, post = env
    _, body = _call(front=date)
    assert body['status'] == 'no_page_info' and body['articles'] == []
    post.assert_not_called()


def test_no_front_page_is_holiday_and_briefly_cached(env):
    table, post = env
    post.return_value = _resp([_doc(1, page='3')])
    _, body = _call(front='1994-01-03')
    assert body['status'] == 'no_paper' and body['reason'] == 'holiday'
    assert [p['news_id'] for p in table.puts] == ['timemachine_front_empty_1994-01-03']
    _, again = _call(front='1994-01-03')
    assert again['cached'] is True and again['reason'] == 'holiday'
    assert post.call_count == 1


def test_front_page_cached_and_never_collides_with_day_cache(env):
    table, post = env
    post.return_value = _resp([_doc(1, sent='2024-12-03T17:44:00.000+09:00')])
    _, first = _call(front='2024-12-04')
    _, second = _call(front='2024-12-04')
    assert first['cached'] is False and second['cached'] is True
    assert second['articles'] == first['articles']
    assert post.call_count == 1
    assert [p['news_id'] for p in table.puts] == ['timemachine_front_2024-12-04']


def test_today_is_not_cached(env):
    table, post = env
    post.return_value = _resp([_doc(1, sent='2026-10-18T23:31:00.000+09:00')])
    _, body = _call(front='2026-10-19')
    assert body['status'] == 'ok'
    assert table.puts == []


def test_validation_and_errors(env):
    _, post = env
    assert _call(front='1989-12-31')[0] == 400
    assert _call(front='2000-13-01')[0] == 400
    post.side_effect = RuntimeError('boom')
    status, body = _call(front='2020-03-12')
    assert status == 502 and 'boom' not in json.dumps(body, ensure_ascii=False)


def test_q_takes_precedence_over_front(env):
    _, post = env
    post.return_value = _resp([])
    status, body = _call(q='IMF', **{'from': '1997-11-21'}, to='1997-12-31', front='2020-03-12')
    assert status == 200 and 'query' in body
