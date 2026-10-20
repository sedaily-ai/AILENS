"""타임머신 '그날의 1면' 모드(handlers.timeline.time_machine front 파라미터 + bigkinds_search 1면·그날 기사 조회) 단위 테스트.
생일에 신문이 없을 때 직전 발행일로 거슬러 찾는 것과, 면 번호가 없는 시기의 '그날 서울경제'를 함께 본다.
외부 호출(빅카인즈 HTTP·SSM·DynamoDB)과 1면 없는 날 목록은 전부 mock.
실행: cd service/backend && python3 -m pytest tests/test_time_machine_front_unit.py -q
"""
import json
import time
from unittest.mock import MagicMock

import pytest

from handlers.timeline import time_machine as tm
from services.timeline import bigkinds_search as bs
from services.timeline import front_calendar as fc
from common.dates import validation as dv

FRONT_KEYS = {'date', 'date_kind', 'shown_date', 'kind', 'reason', 'articles', 'status', 'cached'}


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


def _calendar(no_front=(), until='2026-10-18', unknown=()):
    return fc.FrontCalendar(ranges=(('1994-01-01', '1996-07-31'), ('2017-11-13', until)),
                            no_front=frozenset(no_front), unknown=frozenset(unknown))


def _set_calendar(monkeypatch, **kwargs):
    monkeypatch.setattr(tm, '_front_calendar', lambda: _calendar(**kwargs))


@pytest.fixture
def env(monkeypatch):
    monkeypatch.setattr(dv, 'today_kst', lambda: '2026-10-19')
    monkeypatch.setattr(tm, 'today_kst', lambda: '2026-10-19')
    monkeypatch.setattr(bs, 'get_secret', lambda name: 'KEY')
    _set_calendar(monkeypatch)
    table = _FakeTable()
    monkeypatch.setattr(tm, '_get_table', lambda: table)
    post = MagicMock(return_value=_resp([]))
    monkeypatch.setattr(bs.requests, 'post', post)
    return table, post


def _call(**params):
    event = {'requestContext': {'http': {'method': 'GET'}}, 'queryStringParameters': params}
    res = tm.lambda_handler(event, None)
    return res['statusCode'], json.loads(res['body'])


def _range(post, n):
    return post.call_args_list[n].kwargs['json']['argument']['published_at']


# ─── 빅카인즈 조회 함수 ──────────────────────────────────────────────────────

def test_count_front_page_is_light(env):
    _, post = env
    post.return_value = _resp([_doc(1), _doc(2, page='3'), _doc(3, sent='2019-10-09T17:00:00.000+09:00')])
    assert bs.count_front_page('2019-10-09', bs.FRONT_MATCH_SENT) == 1
    assert post.call_args.kwargs['json']['argument']['fields'] == bs.FRONT_COUNT_FIELDS
    assert post.call_args.kwargs['timeout'] == bs.FRONT_COUNT_TIMEOUT_SECONDS


def test_timeout_never_exceeds_caller_budget(env):
    _, post = env
    bs.search_front_page('2019-10-09', bs.FRONT_MATCH_SENT, timeout=3.5)
    assert post.call_args.kwargs['timeout'] == 3.5
    bs.search_front_page('2019-10-09', bs.FRONT_MATCH_SENT, timeout=99)
    assert post.call_args.kwargs['timeout'] == bs.FRONT_PAGE_TIMEOUT_SECONDS


def test_photo_caption_never_leads(env):
    _, post = env
    post.return_value = _resp([_doc(1, content='짧음'), _doc(2, title='[사진] 귀성길', content='아주 긴 사진 설명 본문입니다')])
    assert [a['news_id'] for a in bs.search_front_page('2019-10-09', bs.FRONT_MATCH_SENT)] == ['n1', 'n2']


def test_day_articles_longest_first_without_page_filter(env):
    _, post = env
    docs = [_doc(i, page='', content='가' * n) for i, n in [(1, 10), (2, 50), (3, 30), (4, 40), (5, 20)]]
    post.return_value = _resp(docs + [_doc(6, page='', title='[부고] 홍길동', content='가' * 99)])
    assert [a['news_id'] for a in bs.search_day_articles('2010-05-12', 4)] == ['n2', 'n4', 'n3', 'n5']
    argument = post.call_args.kwargs['json']['argument']
    assert argument['published_at'] == {'from': '2010-05-12', 'until': '2010-05-13'}
    assert 'printing_page' not in argument['fields']


def test_longest_first_measures_full_body_not_preview(env):
    _, post = env
    # 미리보기는 150자로 잘리므로 자르기 전 길이로 줄 세워야 한다.
    post.return_value = _resp([_doc(1, content='가' * 200), _doc(2, content='나' * 900)])
    assert [a['news_id'] for a in bs.search_front_page('2019-10-09', bs.FRONT_MATCH_SENT)] == ['n2', 'n1']


# ─── 생일 당일 1면 ───────────────────────────────────────────────────────────

def test_front_page_on_the_day(env):
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
    assert status == 200 and set(body) == FRONT_KEYS
    assert (body['kind'], body['shown_date'], body['reason'], body['status']) == ('front', '2019-10-09', None, 'ok')
    assert [a['news_id'] for a in body['articles']] == ['n2', 'n1']  # 본문 길이 순
    assert set(body['articles'][0]) == {'news_id', 'title', 'content', 'byline', 'category', 'original_link'}
    assert post.call_count == 1  # 목록이 1면 있음을 알려 줘 가벼운 확인 없이 바로 본문을 받는다
    argument = post.call_args.kwargs['json']['argument']
    assert argument['published_at'] == {'from': '2019-10-08', 'until': '2019-10-10'}
    assert 'printing_page' in argument['fields'] and 'enveloped_at' in argument['fields']
    assert argument['return_size'] == bs.FRONT_PAGE_FETCH_SIZE


def test_1990s_use_published_date_and_ignore_archive_send_time(env):
    _, post = env
    # 1990년대 송고 시각은 보관 작업 시각이라 인쇄일과 맞지 않아도 그날 기사로 본다.
    post.return_value = _resp([_doc(1, sent='1996-06-01T15:00:00.000+09:00'), _doc(2, page='5')])
    _, body = _call(front='1996-06-01')
    assert [a['news_id'] for a in body['articles']] == ['n1']
    assert post.call_args.kwargs['json']['argument']['published_at'] == {'from': '1996-06-01', 'until': '1996-06-02'}


def test_sunday_before_closure_is_fetched(env):
    _, post = env
    post.return_value = _resp([_doc(1, sent='1996-06-02T01:00:00.000+09:00')])
    _, body = _call(front='1996-06-02')
    assert (body['kind'], body['shown_date'], body['reason']) == ('front', '1996-06-02', None)
    post.assert_called_once()


# ─── 신문이 없는 날 → 직전 발행일 ─────────────────────────────────────────────

def test_sunday_falls_back_to_saturday(env):
    _, post = env
    post.return_value = _resp([_doc(1, sent='2024-10-11T18:00:00.000+09:00')])
    _, body = _call(front='2024-10-13')
    assert (body['kind'], body['shown_date'], body['reason'], body['status']) == ('front', '2024-10-12', 'sunday', 'no_paper')
    assert post.call_count == 1 and _range(post, 0) == {'from': '2024-10-11', 'until': '2024-10-13'}


def test_calendar_gap_jumps_to_previous_issue(env, monkeypatch):
    _, post = env
    _set_calendar(monkeypatch, no_front={'2025-10-04', '2025-10-06', '2025-10-07', '2025-10-08', '2025-10-09'})
    post.return_value = _resp([_doc(1, sent='2025-10-02T18:00:00.000+09:00')])
    _, body = _call(front='2025-10-09')
    assert (body['kind'], body['shown_date'], body['reason']) == ('front', '2025-10-03', 'no_paper')
    assert post.call_count == 1 and _range(post, 0) == {'from': '2025-10-02', 'until': '2025-10-04'}


def test_sunday_without_paper_before_closure_is_not_called_sunday(env, monkeypatch):
    _, post = env
    # 1996년 9월 전에는 일요일자가 나오던 시기라, 보관본에 없는 일요일을 '일요일이라 휴간'으로 단정하지 않는다.
    _set_calendar(monkeypatch, no_front={'1995-03-05'})
    post.return_value = _resp([_doc(1)])
    _, body = _call(front='1995-03-05')
    assert (body['shown_date'], body['reason']) == ('1995-03-04', 'no_paper')


def test_dates_after_calendar_are_checked_lightly(env, monkeypatch):
    table, post = env
    _set_calendar(monkeypatch, until='2026-10-10')
    front = _resp([_doc(1, sent='2026-10-14T18:00:00.000+09:00')])
    post.side_effect = [_resp([]), front, front]
    _, body = _call(front='2026-10-16')
    assert (body['kind'], body['shown_date'], body['reason']) == ('front', '2026-10-15', 'no_paper')
    # 생일 당일은 확인 없이 바로 본문, 거슬러 찾는 날만 본문 없는 확인을 먼저 한다.
    fields = [c.kwargs['json']['argument']['fields'] for c in post.call_args_list]
    assert 'content' in fields[0] and fields[1] == bs.FRONT_COUNT_FIELDS and 'content' in fields[2]
    # 그때 조회한 0건으로 생일을 건너뛴 결과는 적재 지연일 수 있어 짧게만 저장한다.
    left = table.puts[0]['expires_at'] - time.time()
    assert tm.FRONT_LIVE_FALLBACK_TTL_SECONDS - 60 < left <= tm.FRONT_LIVE_FALLBACK_TTL_SECONDS


def test_rule_skipped_fallback_is_cached_long(env):
    table, post = env
    post.return_value = _resp([_doc(1, sent='2024-10-11T18:00:00.000+09:00')])
    _call(front='2024-10-13')
    assert table.puts[0]['expires_at'] - time.time() > 3000 * 86400


def test_unknown_calendar_day_is_fetched_directly_on_the_birthday(env, monkeypatch):
    _, post = env
    _set_calendar(monkeypatch, unknown={'2019-10-09'})
    post.return_value = _resp([_doc(1)])
    _, body = _call(front='2019-10-09')
    assert body['shown_date'] == '2019-10-09' and post.call_count == 1


def test_today_without_paper_yet_is_not_called_holiday(env):
    table, post = env
    # 2026-10-19(월, 오늘) 1면이 아직 없으면 일요일 10-18 은 건너뛰고 10-17 토요일자를 보여 주되 휴간이라 하지 않는다.
    post.side_effect = [_resp([]), _resp([_doc(1, sent='2026-10-16T18:00:00.000+09:00')])]
    _, body = _call(front='2026-10-19')
    assert (body['shown_date'], body['reason']) == ('2026-10-17', 'not_yet')
    assert table.puts == []


def test_timeouts_shrink_to_remaining_budget(env, monkeypatch):
    _, post = env
    monkeypatch.setattr(tm, 'FRONT_SEARCH_BUDGET_SECONDS', 5)
    post.return_value = _resp([_doc(1, page='')])
    _call(front='2010-05-12')
    assert 0 < post.call_args.kwargs['timeout'] <= 5


def test_front_with_only_excluded_corners_moves_on(env):
    _, post = env
    post.side_effect = [_resp([_doc(1, title='[사설] 코너', sent='2019-10-08T18:00:00.000+09:00')]),
                        _resp([_doc(2, sent='2019-10-07T18:00:00.000+09:00')])]
    _, body = _call(front='2019-10-09')
    assert (body['shown_date'], body['reason']) == ('2019-10-08', 'no_paper')
    assert [a['news_id'] for a in body['articles']] == ['n2']


# ─── 면 번호가 없는 시기 → 그날 서울경제 ─────────────────────────────────────

def test_no_page_era_returns_day_articles(env):
    _, post = env
    post.return_value = _resp([_doc(i, page='', content='가' * i) for i in range(1, 6)])
    _, body = _call(front='2010-05-12')
    assert (body['kind'], body['shown_date'], body['reason'], body['status']) == ('day', '2010-05-12', None, 'no_page_info')
    assert [a['news_id'] for a in body['articles']] == ['n5', 'n4', 'n3', 'n2']


def test_no_page_era_sunday_skips_to_saturday(env):
    _, post = env
    post.return_value = _resp([_doc(1, page='')])
    _, body = _call(front='2005-03-06')
    assert (body['kind'], body['shown_date'], body['reason']) == ('day', '2005-03-05', 'sunday')
    assert post.call_count == 1 and _range(post, 0) == {'from': '2005-03-05', 'until': '2005-03-06'}


def test_empty_archive_walks_back_then_gives_up(env):
    table, post = env
    _, body = _call(front='1998-07-15')
    assert body == {'date': '1998-07-15', 'date_kind': 'day', 'shown_date': None, 'kind': 'none', 'reason': 'archive_missing',
                    'articles': [], 'status': 'no_page_info', 'cached': False}
    assert post.call_count == 9  # 생일 포함 11일 중 휴간 일요일(7.12·7.5) 2일은 묻지 않는다
    assert [p['news_id'] for p in table.puts] == ['timemachine_frontv2_none_1998-07-15']
    _, again = _call(front='1998-07-15')
    assert again['cached'] is True and again['kind'] == 'none' and post.call_count == 9


def test_walk_stops_at_archive_start(env):
    _, post = env
    _, body = _call(front='1990-01-03')
    assert body['kind'] == 'none' and post.call_count == 3  # 1.3·1.2·1.1 — 1989년은 보관본 밖


@pytest.mark.parametrize('date, no_front, responses, expected', [
    # 1994-01-01(신정)은 면 번호 시기지만 1면이 없어, 면 번호가 없는 1993-12-31 그날 기사로 간다.
    ('1994-01-01', {'1994-01-01'}, [[_doc(1, page='')]], ('front', 'day', '1993-12-31', 'no_paper', 'no_paper')),
    # 1996-08-01은 면 번호가 없는 시기인데 그날 기사가 없어, 면 번호가 있는 1996-07-31 1면으로 간다.
    ('1996-08-01', set(), [[], [_doc(1)]], ('day', 'front', '1996-07-31', 'no_paper', 'no_page_info')),
])
def test_crossing_era_boundary(env, monkeypatch, date, no_front, responses, expected):
    _, post = env
    _set_calendar(monkeypatch, no_front=no_front)
    post.side_effect = [_resp(docs) for docs in responses]
    _, body = _call(front=date)
    # date_kind 는 생일 쪽 시기 — 화면 안내가 '1면이 없어요'와 '서울경제가 없어요'를 이것으로 가른다.
    assert (body['date_kind'], body['kind'], body['shown_date'], body['reason'], body['status']) == expected


def test_front_era_none_keeps_legacy_holiday_status(env):
    _, post = env
    _, body = _call(front='2019-10-09')
    assert (body['date_kind'], body['kind'], body['status']) == ('front', 'none', 'no_paper')


# ─── 캐시·오류 ──────────────────────────────────────────────────────────────

def test_resolved_result_cached_under_requested_date(env):
    table, post = env
    post.return_value = _resp([_doc(1, sent='2024-10-11T18:00:00.000+09:00')])
    _, first = _call(front='2024-10-13')
    _, second = _call(front='2024-10-13')
    assert first['cached'] is False and second['cached'] is True
    assert {k: v for k, v in second.items() if k != 'cached'} == {k: v for k, v in first.items() if k != 'cached'}
    assert post.call_count == 1
    assert [p['news_id'] for p in table.puts] == ['timemachine_frontv2_2024-10-13']


def test_today_is_not_cached(env):
    table, post = env
    post.return_value = _resp([_doc(1, sent='2026-10-18T23:31:00.000+09:00')])
    _, body = _call(front='2026-10-19')
    assert body['kind'] == 'front' and body['shown_date'] == '2026-10-19'
    assert table.puts == []


def test_search_budget_exceeded_is_502(env, monkeypatch):
    _, post = env
    monkeypatch.setattr(tm, 'FRONT_SEARCH_BUDGET_SECONDS', 0)
    status, body = _call(front='2019-10-09')
    assert status == 502 and '초과' not in json.dumps(body, ensure_ascii=False)
    post.assert_not_called()


def test_validation_and_errors(env):
    _, post = env
    assert _call(front='1989-12-31')[0] == 400
    assert _call(front='2000-13-01')[0] == 400
    post.side_effect = RuntimeError('boom')
    status, body = _call(front='2020-03-12')
    assert status == 502 and 'boom' not in json.dumps(body, ensure_ascii=False)


def test_log_never_contains_dates(env, caplog):
    _, post = env
    post.return_value = _resp([_doc(1, sent='2024-10-11T18:00:00.000+09:00')])
    with caplog.at_level('INFO'):
        _call(front='2024-10-13')
    assert '2024-10-1' not in caplog.text


def test_q_takes_precedence_over_front(env):
    _, post = env
    post.return_value = _resp([])
    status, body = _call(q='IMF', **{'from': '1997-11-21'}, to='1997-12-31', front='2020-03-12')
    assert status == 200 and 'query' in body
