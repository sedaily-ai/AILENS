"""타임머신 '그날의 1면' 모드(handlers.timeline.time_machine front 파라미터 + bigkinds_search 1면·그날 기사 조회) 단위 테스트.
생일에 신문이 없을 때 직전 발행일로 거슬러 찾는 것과, 면 번호가 없는 시기의 '그날 서울경제'를 함께 본다.
외부 호출(빅카인즈 HTTP·SSM·DynamoDB)과 1면 없는 날 목록은 전부 mock.
실행: cd service/backend && python3 -m pytest tests/test_time_machine_front_unit.py -q
"""
import json
import threading
import time
from decimal import Decimal
from unittest.mock import MagicMock

import pytest

from handlers.timeline import time_machine as tm
from services.timeline import bigkinds_search as bs
from services.timeline import front_calendar as fc
from common.dates import validation as dv

FRONT_KEYS = {'date', 'date_kind', 'shown_date', 'kind', 'reason', 'basis', 'articles', 'status', 'cached'}


class _FakeTable:
    def __init__(self):
        self.items = {}
        self.puts = []
        self.gets = []

    def get_item(self, Key):
        self.gets.append(Key['news_id'])
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


def _issue(*clusters):
    """빅카인즈 이슈 순위 응답 — 이슈마다 묶인 기사 번호 목록."""
    r = MagicMock()
    r.raise_for_status.return_value = None
    r.json.return_value = {'result': 0, 'return_object': {'topics': [{'topic': '낱말 묶음', 'news_cluster': list(c)} for c in clusters]}}
    return r


def _route(post, search, issue=None):
    """검색과 이슈 순위 요청을 주소로 나눠 응답한다. search 는 응답 하나(계속 같은 것) 또는 목록(차례로)."""
    queue = list(search) if isinstance(search, list) else None

    def answer(url, **kwargs):
        if url == bs.BIGKINDS_ISSUE_URL:
            if isinstance(issue, Exception):
                raise issue
            return issue or _issue()
        return queue.pop(0) if queue is not None else search
    post.side_effect = answer


def _answer(post, days, issue=None, before_search=None, before_ranking=None):
    """그날 기사 요청은 published_at 시작 날짜로 days[날짜](없으면 0건)를, 이슈 순위는 issue 를 준다.
    before_* 는 다른 스레드에서 나가는 이슈 순위 요청과 맞추는 데 쓴다(인자는 그 요청의 날짜)."""
    def answer(url, **kwargs):
        argument = kwargs['json']['argument']
        if url == bs.BIGKINDS_ISSUE_URL:
            if before_ranking:
                before_ranking(argument['date'])
            if isinstance(issue, Exception):
                raise issue
            return issue or _issue()
        if before_search:
            before_search(argument['published_at']['from'])
        return _resp(days.get(argument['published_at']['from'], []))
    post.side_effect = answer


def _searches(post):
    return [c for c in post.call_args_list if c.args[0] == bs.BIGKINDS_SEARCH_URL]


def _rankings(post):
    return [c for c in post.call_args_list if c.args[0] == bs.BIGKINDS_ISSUE_URL]


def _no_direct_post(*args, **kwargs):
    raise AssertionError('빅카인즈는 bigkinds_search._SESSION 으로만 부른다')


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
    monkeypatch.setattr(bs._SESSION, 'post', post)
    monkeypatch.setattr(bs, '_session_last_used', 0.0)
    monkeypatch.setattr(bs.requests, 'post', _no_direct_post)
    yield table, post
    # 함께 부른 이슈 순위 스레드가 끝난 뒤에 가짜 응답을 되돌린다 — 뒤에 남은 스레드가 실제 빅카인즈로 나가지 않게.
    for thread in threading.enumerate():
        if thread.name.startswith('bigkinds-issue'):
            thread.join(2)


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


def test_pick_day_articles_follows_most_covered_issues(env):
    docs = [_doc(i, page='', content='가' * n) for i, n in [(1, 10), (2, 50), (3, 30), (4, 40), (5, 20)]]
    docs.append(_doc(6, page='', title='[社說] 大企業의 役割', content='가' * 99))
    docs.append(_doc(7, page='', title='[TV하이라이트]', content='가' * 99))  # 편성표는 본문이 길어도 고르지 않는다
    # 기사가 많은 이슈부터, 이슈마다 서울경제 기사 중 본문이 가장 긴 1건. 한자 사설은 고르지 않는다.
    clusters = [['x1', 'n1', 'n3', 'x2', 'x3'], ['n6', 'x4', 'x5', 'x6'], ['n5', 'x7'], ['y1']]
    articles, basis = bs.pick_day_articles(docs, clusters, 4)
    assert basis == bs.DAY_BASIS_ISSUE
    assert [(a['news_id'], a['coverage']) for a in articles] == [('n3', 5), ('n5', 2), ('n2', None), ('n4', None)]


def test_pick_day_articles_without_ranking_or_match(env):
    docs = [_doc(i, page='', content='가' * n) for i, n in [(1, 10), (2, 50)]]
    articles, basis = bs.pick_day_articles(docs, [], 4)
    assert basis == bs.DAY_BASIS_NO_RANKING and [a['news_id'] for a in articles] == ['n2', 'n1']
    articles, basis = bs.pick_day_articles(docs, [['x1', 'x2']], 4)
    assert basis == bs.DAY_BASIS_NO_MATCH and [a['coverage'] for a in articles] == [None, None]


def test_fetch_issue_clusters_sorts_by_size(env):
    _, post = env
    post.return_value = _issue(['a'], ['b', 'c', 'd'], [], ['e', 'f'])
    assert bs.fetch_issue_clusters('2010-05-12') == [['b', 'c', 'd'], ['e', 'f'], ['a']]
    assert post.call_args.args[0] == bs.BIGKINDS_ISSUE_URL
    assert post.call_args.kwargs['json']['argument'] == {'date': '2010-05-12'}
    assert post.call_args.kwargs['timeout'] == bs.ISSUE_TIMEOUT_SECONDS
    rejected = MagicMock()
    rejected.raise_for_status.return_value = None
    rejected.json.return_value = {'result': 1, 'reason': 'x'}
    post.return_value = rejected
    with pytest.raises(bs.BigKindsRejected):
        bs.fetch_issue_clusters('2010-05-12')


def test_session_is_closed_only_after_idle(env, monkeypatch):
    _, post = env
    close = MagicMock()
    monkeypatch.setattr(bs._SESSION, 'close', close)
    now = [1000.0]
    monkeypatch.setattr(bs.time, 'monotonic', lambda: now[0])
    bs.fetch_issue_clusters('2010-05-12')
    bs.search_day_docs('2010-05-12')
    now[0] += 59  # 1분 안쪽의 다음 호출은 남은 연결을 그대로 쓴다
    bs.search_day_docs('2010-05-12')
    close.assert_not_called()
    now[0] += 61  # 오래 쉰 연결은 끊겨 있을 수 있어 풀을 비우고 새로 맺는다
    bs.search_day_docs('2010-05-12')
    close.assert_called_once()
    assert post.call_count == 4 and {c.args[0] for c in post.call_args_list} == {bs.BIGKINDS_ISSUE_URL, bs.BIGKINDS_SEARCH_URL}


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
    _route(post, _resp([_doc(1, page='')]))
    _call(front='2010-05-12')
    assert all(0 < c.kwargs['timeout'] <= 5 for c in post.call_args_list) and len(post.call_args_list) == 2


def test_front_with_only_excluded_corners_moves_on(env):
    _, post = env
    post.side_effect = [_resp([_doc(1, title='[사설] 코너', sent='2019-10-08T18:00:00.000+09:00')]),
                        _resp([_doc(2, sent='2019-10-07T18:00:00.000+09:00')])]
    _, body = _call(front='2019-10-09')
    assert (body['shown_date'], body['reason']) == ('2019-10-08', 'no_paper')
    assert [a['news_id'] for a in body['articles']] == ['n2']


# ─── 면 번호가 없는 시기 → 그날 서울경제 ─────────────────────────────────────

def test_no_page_era_returns_most_covered_issue_articles(env):
    _, post = env
    _route(post, _resp([_doc(i, page='', content='가' * i) for i in range(1, 6)]), _issue(['x'] * 96 + ['n2'], ['n4', 'x']))
    _, body = _call(front='2010-05-12')
    assert (body['kind'], body['shown_date'], body['reason'], body['basis'], body['status']) == ('day', '2010-05-12', None, 'issue', 'no_page_info')
    assert [(a['news_id'], a['coverage']) for a in body['articles']] == [('n2', 97), ('n4', 2), ('n5', None), ('n3', None)]
    search = _searches(post)[0].kwargs['json']['argument']
    assert search['published_at'] == {'from': '2010-05-12', 'until': '2010-05-13'} and 'printing_page' not in search['fields']


def test_no_page_era_without_ranking_uses_longest(env):
    _, post = env
    _route(post, _resp([_doc(i, page='', content='가' * i) for i in range(1, 6)]))
    _, body = _call(front='2014-04-16')
    assert body['basis'] == 'no_ranking' and [a['news_id'] for a in body['articles']] == ['n5', 'n4', 'n3', 'n2']


def test_ranking_failure_still_shows_day_and_caches_briefly(env):
    table, post = env
    _route(post, _resp([_doc(1, page='')]), RuntimeError('issue down'))
    status, body = _call(front='2010-05-12')
    assert status == 200 and body['basis'] == 'ranking_failed' and [a['news_id'] for a in body['articles']] == ['n1']
    left = table.puts[0]['expires_at'] - time.time()
    assert left <= tm.FRONT_LIVE_FALLBACK_TTL_SECONDS


def test_issue_based_day_is_cached_long(env):
    table, post = env
    _route(post, _resp([_doc(1, page='')]), _issue(['n1', 'x']))
    _call(front='2010-05-12')
    assert table.puts[0]['expires_at'] - time.time() > 3000 * 86400


def test_day_docs_and_ranking_run_together(env):
    _, post = env
    asked, seen = threading.Event(), []
    # 그날 기사 응답이 오기 전에 이슈 순위 요청이 이미 나가 있어야 한다(직렬이면 2초를 기다려도 오지 않는다).
    _answer(post, {'2010-05-12': [_doc(1, page='')]}, _issue(['n1', 'x']),
            before_search=lambda day: seen.append(asked.wait(2)), before_ranking=lambda day: asked.set())
    _, body = _call(front='2010-05-12')
    assert seen == [True] and body['basis'] == 'issue'
    assert [a['coverage'] for a in body['articles']] == [2]


def test_empty_first_day_discards_ranking_without_waiting(env, caplog):
    _, post = env
    asked, hold, first = threading.Event(), threading.Event(), []

    def ranking(day):
        asked.set()
        if not first:
            first.append(day)
            hold.wait(3)  # 버릴 순위 응답은 늦게 온다 — 응답이 그것을 기다리면 안 된다

    _answer(post, {'2010-05-11': [_doc(1, page='')]}, before_search=lambda day: asked.wait(2), before_ranking=ranking)
    try:
        started = time.monotonic()
        with caplog.at_level('INFO'):
            _, body = _call(front='2010-05-12')
        assert time.monotonic() - started < 1
    finally:
        hold.set()
    assert (body['shown_date'], body['reason']) == ('2010-05-11', 'no_paper')
    assert first == ['2010-05-12'] and caplog.text.count(tm.RANKING_DISCARDED_LOG) == 1


def test_slow_ranking_past_budget_is_ranking_failed(env, monkeypatch):
    table, post = env
    monkeypatch.setattr(tm, 'FRONT_SEARCH_BUDGET_SECONDS', 1)
    hold = threading.Event()
    _answer(post, {'2010-05-12': [_doc(1, page='')]}, _issue(['n1']), before_ranking=lambda day: hold.wait(3))
    try:
        status, body = _call(front='2010-05-12')
    finally:
        hold.set()
    # 예산이 다 되면 순위를 더 기다리지 않고, 받은 그날 기사를 본문이 긴 순으로 보여 준 뒤 짧게만 저장한다.
    assert status == 200 and body['basis'] == 'ranking_failed' and [a['news_id'] for a in body['articles']] == ['n1']
    assert table.puts[0]['expires_at'] - time.time() <= tm.FRONT_LIVE_FALLBACK_TTL_SECONDS


def test_later_walk_days_ask_ranking_after_docs(env):
    _, post = env
    _answer(post, {'2010-05-11': [_doc(1, page='')]}, _issue(['n1']))
    _, body = _call(front='2010-05-12')
    assert body['shown_date'] == '2010-05-11' and body['basis'] == 'issue'
    calls = post.call_args_list
    search_at = next(i for i, c in enumerate(calls) if c.args[0] == bs.BIGKINDS_SEARCH_URL
                     and c.kwargs['json']['argument']['published_at']['from'] == '2010-05-11')
    ranking_at = next(i for i, c in enumerate(calls) if c.args[0] == bs.BIGKINDS_ISSUE_URL
                      and c.kwargs['json']['argument']['date'] == '2010-05-11')
    assert ranking_at > search_at  # 처음 묻는 날이 아니면 그날 기사를 받은 뒤에만 순위를 묻는다


def test_empty_day_asks_ranking_only_on_first_day(env):
    _, post = env
    asked = threading.Event()
    # 첫 날은 순위를 함께 보내(여기서는 나간 것을 확인한 뒤 0건을 준다) 버리고, 그 뒤 빈 날들은 순위를 묻지 않는다.
    _answer(post, {}, before_search=lambda day: asked.wait(2), before_ranking=lambda day: asked.set())
    _, body = _call(front='2010-05-12')
    assert body['kind'] == 'none'
    assert [c.kwargs['json']['argument']['date'] for c in _rankings(post)] == ['2010-05-12']
    assert len(_searches(post)) == 9  # 생일 포함 11일 중 휴간 일요일(5.9·5.2) 2일은 묻지 않는다


def test_no_page_era_sunday_skips_to_saturday(env):
    _, post = env
    _route(post, _resp([_doc(1, page='')]))
    _, body = _call(front='2005-03-06')
    assert (body['kind'], body['shown_date'], body['reason']) == ('day', '2005-03-05', 'sunday')
    searches = _searches(post)
    assert len(searches) == 1 and searches[0].kwargs['json']['argument']['published_at'] == {'from': '2005-03-05', 'until': '2005-03-06'}


def test_empty_archive_walks_back_then_gives_up(env):
    table, post = env
    asked = threading.Event()
    _answer(post, {}, before_search=lambda day: asked.wait(2), before_ranking=lambda day: asked.set())
    _, body = _call(front='1998-07-15')
    assert body == {'date': '1998-07-15', 'date_kind': 'day', 'shown_date': None, 'kind': 'none', 'reason': 'archive_missing', 'basis': None,
                    'articles': [], 'status': 'no_page_info', 'cached': False}
    assert len(_searches(post)) == 9  # 생일 포함 11일 중 휴간 일요일(7.12·7.5) 2일은 묻지 않는다
    assert len(_rankings(post)) == 1  # 첫 날 함께 보낸 순위 1회만 버려진다
    assert [p['news_id'] for p in table.puts] == ['timemachine_frontv2_none_1998-07-15']
    # 오래전 날짜의 보관본 공백은 일시적이지 않아 6시간이 아니라 오래 둔다.
    assert table.puts[0]['expires_at'] - time.time() > 3000 * 86400
    _, again = _call(front='1998-07-15')
    assert again['cached'] is True and again['kind'] == 'none' and post.call_count == 10


def test_walk_stops_at_archive_start(env):
    _, post = env
    _, body = _call(front='1990-01-03')
    assert body['kind'] == 'none' and len(_searches(post)) == 3  # 1.3·1.2·1.1 — 1989년은 보관본 밖


@pytest.mark.parametrize('date, no_front, responses, expected', [
    # 1994-01-01(신정)은 면 번호 시기지만 1면이 없어, 면 번호가 없는 1993-12-31 그날 기사로 간다.
    ('1994-01-01', {'1994-01-01'}, [[_doc(1, page='')]], ('front', 'day', '1993-12-31', 'no_paper', 'no_paper')),
    # 1996-08-01은 면 번호가 없는 시기인데 그날 기사가 없어, 면 번호가 있는 1996-07-31 1면으로 간다.
    ('1996-08-01', set(), [[], [_doc(1)]], ('day', 'front', '1996-07-31', 'no_paper', 'no_page_info')),
])
def test_crossing_era_boundary(env, monkeypatch, date, no_front, responses, expected):
    _, post = env
    _set_calendar(monkeypatch, no_front=no_front)
    _route(post, [_resp(docs) for docs in responses])
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


def _cached(table, day, shown, kind='front', basis=None, articles=None):
    """day 를 생일로 조회해 저장된 캐시 항목을 미리 넣는다."""
    articles = articles if articles is not None else [{'news_id': f'c-{day}', 'title': '저장된 기사', 'content': '', 'byline': '',
                                                       'category': '', 'original_link': None}]
    table.items[f'timemachine_frontv2_{day}'] = {
        'news_id': f'timemachine_frontv2_{day}', 'item_type': 'timemachine_frontv2_cache', 'date': day,
        'data': {'date': day, 'date_kind': kind, 'shown_date': shown, 'kind': kind, 'reason': None if shown == day else 'no_paper',
                 'basis': basis, 'articles': articles},
        'cached_at': '2026-10-20T22:58:00+09:00', 'expires_at': int(time.time()) + 3000 * 86400}
    return articles


def test_walk_back_reuses_cached_own_paper(env):
    table, post = env
    saved = _cached(table, '2024-10-12', '2024-10-12')
    _, body = _call(front='2024-10-13')
    assert (body['kind'], body['shown_date'], body['reason']) == ('front', '2024-10-12', 'sunday')
    assert body['articles'] == saved and post.call_count == 0
    assert table.puts[-1]['news_id'] == 'timemachine_frontv2_2024-10-13'
    assert table.puts[-1]['expires_at'] - time.time() > 3000 * 86400


def test_walk_back_ignores_fallback_or_ranking_failed_cache(env):
    table, post = env
    # 다른 날 신문으로 대신한 결과는 그날 자기 신문이 아니다.
    _cached(table, '2024-10-12', '2024-10-11')
    post.return_value = _resp([_doc(1, sent='2024-10-11T18:00:00.000+09:00')])
    _, body = _call(front='2024-10-13')
    assert body['shown_date'] == '2024-10-12' and [a['news_id'] for a in body['articles']] == ['n1'] and post.call_count == 1
    # 이슈 순위를 못 받아 본문이 긴 순으로 대신 고른 결과도 다시 묻는다.
    _cached(table, '2005-03-05', '2005-03-05', kind='day', basis='ranking_failed')
    _answer(post, {'2005-03-05': [_doc(2, page='')]}, _issue(['n2']))
    _, body = _call(front='2005-03-06')
    assert (body['shown_date'], body['basis']) == ('2005-03-05', 'issue') and [a['news_id'] for a in body['articles']] == ['n2']


def test_walk_back_reuse_keeps_live_skip(env):
    table, post = env
    # 생일(그날 기사 시기)이 그때 조회한 0건이라 건너뛴 사실은 재사용한 결과에도 남는다.
    _cached(table, '2010-05-11', '2010-05-11', kind='day', basis='issue')
    found = tm._resolve_front_page('2010-05-12')
    assert (found.shown, found.kind, found.basis, found.live_skip) == ('2010-05-11', 'day', 'issue', True)
    assert len(_searches(post)) == 1


def test_settled_live_skip_fallback_is_cached_long(env):
    table, post = env
    # 그날 기사 시기의 명절 생일: 그날 0건 → 전날 기사. 오래전 날짜라 적재 지연이 아니어서 오래 둔다.
    _answer(post, {'2010-05-11': [_doc(1, page='')]}, _issue(['n1']))
    _, body = _call(front='2010-05-12')
    assert (body['shown_date'], body['reason']) == ('2010-05-11', 'no_paper')
    assert table.puts[0]['expires_at'] - time.time() > 3000 * 86400


def test_recent_none_is_kept_briefly(env, monkeypatch):
    table, post = env
    _set_calendar(monkeypatch, until='2026-09-30')
    _, body = _call(front='2026-10-12')
    assert body['kind'] == 'none'
    assert [p['news_id'] for p in table.puts] == ['timemachine_frontv2_none_2026-10-12']
    assert table.puts[0]['expires_at'] - time.time() <= tm.NEGATIVE_CACHE_TTL_SECONDS


def test_cache_item_shape_is_unchanged(env):
    table, post = env
    post.return_value = _resp([_doc(1, sent='2024-10-11T18:00:00.000+09:00')])
    _call(front='2024-10-13')
    post.return_value = _resp([])
    _call(front='2019-10-09')
    front, none = table.puts
    for item, key, item_type in ((front, 'timemachine_frontv2_2024-10-13', 'timemachine_frontv2_cache'),
                                 (none, 'timemachine_frontv2_none_2019-10-09', 'timemachine_frontv2_none_cache')):
        assert set(item) == {'news_id', 'item_type', 'date', 'data', 'cached_at', 'expires_at'}
        assert (item['news_id'], item['item_type']) == (key, item_type)
        assert isinstance(item['expires_at'], int) and isinstance(item['cached_at'], str)
        assert set(item['data']) == FRONT_KEYS - {'status', 'cached'}


def test_reads_item_written_by_deployed_lambda(env):
    table, post = env
    # c041fba4 Lambda가 저장한 모양 그대로(DynamoDB가 돌려주는 수는 Decimal).
    article = {'news_id': '02100311.20100511000001', 'title': '저장된 기사', 'content': '미리보기', 'byline': '홍길동',
               'category': '경제', 'original_link': None, 'coverage': Decimal('76')}
    data = {'date': '2010-05-11', 'date_kind': 'day', 'shown_date': '2010-05-11', 'kind': 'day', 'reason': None,
            'basis': 'issue', 'articles': [article]}
    table.items['timemachine_frontv2_2010-05-11'] = {
        'news_id': 'timemachine_frontv2_2010-05-11', 'item_type': 'timemachine_frontv2_cache', 'date': '2010-05-11',
        'data': data, 'cached_at': '2026-10-20T22:58:00+09:00', 'expires_at': Decimal(int(time.time()) + 3000 * 86400)}
    _, body = _call(front='2010-05-11')
    assert body['cached'] is True and post.call_count == 0
    assert {k: v for k, v in body.items() if k not in ('status', 'cached')} == {**data, 'articles': [{**article, 'coverage': 76}]}
    # 같은 항목을 거슬러 간 날의 자기 신문으로도 쓴다(생일 05-12는 그날 기사가 0건).
    _, walked = _call(front='2010-05-12')
    assert (walked['shown_date'], walked['basis'], walked['articles'][0]['coverage']) == ('2010-05-11', 'issue', 76)
    assert len(_searches(post)) == 1


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
