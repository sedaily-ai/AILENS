"""생일 1면 캐시 미리 채우기 스크립트(scripts/warm_front_page_cache.py) 단위 테스트. 서버 코드·DynamoDB·빅카인즈는 전부 가짜.
실행: cd service/backend && uv run --no-project --with pytest==8.3.3 --with requests==2.32.3 --with boto3==1.35.0 \\
        python -m pytest tests/test_warm_front_page_cache_unit.py -q
"""
import importlib.util
import io
import json
import logging
import os
import threading
import time
from collections import Counter, defaultdict
from datetime import date
from unittest.mock import MagicMock

import pytest
import requests

_PATH = os.path.join(os.path.dirname(__file__), '..', 'scripts', 'warm_front_page_cache.py')
_spec = importlib.util.spec_from_file_location('warm_front_page_cache', _PATH)
wf = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(wf)

TODAY = date(2026, 10, 21)
DISCARDED = '버린 순위'
TEN_YEARS, WEEK = 3650, 7


class _Res:
    def __init__(self, status=200, body=None):
        self.status_code = status
        self._body = body if body is not None else {'result': 0}
        self.content = json.dumps(self._body).encode()

    def raise_for_status(self):
        if self.status_code >= 400:
            raise requests.HTTPError(f'HTTP {self.status_code}', response=self)

    def json(self):
        return self._body


class _FakeBs:
    """bigkinds_search 흉내 — 빅카인즈 POST 는 모두 _post(url, payload, timeout) 로 나간다."""
    BIGKINDS_SEARCH_URL = 'https://bk/search'
    BIGKINDS_ISSUE_URL = 'https://bk/issue'
    FRONT_COUNT_FIELDS = ['printing_page', 'enveloped_at']

    def __init__(self, respond=None):
        self.sent = []
        self.respond = respond or (lambda url, payload: _Res())
        self._post = self._send

    def _send(self, url, payload, timeout):
        self.sent.append((url, payload))
        return self.respond(url, payload)


class _FakeTm:
    """get_front_page_data 흉내 — 표에 있으면 cached, 없으면 빅카인즈 1회 + PutItem. plan[날짜] = (kind, 보관 일수, basis) 또는 예외."""
    CACHE_TABLE = 'sedaily-mbti-articles-dev'
    RANKING_DISCARDED_LOG = DISCARDED

    def __init__(self, bs, plan):
        self.bs, self.plan, self.called = bs, plan, []
        self.logger = logging.getLogger('fake_time_machine')
        self.logger.setLevel(logging.INFO)

    def _get_table(self):
        raise AssertionError('스크립트가 표를 바꿔 끼워야 한다')

    def get_front_page_data(self, day):
        self.called.append(day)
        table = self._get_table()
        item = table.get_item(Key={'news_id': f'timemachine_frontv2_{day}'}).get('Item')
        if item:
            return {**item['data'], 'status': 'ok', 'cached': True}
        res = self.bs._post(self.bs.BIGKINDS_SEARCH_URL, {'argument': {'fields': ['title']}}, 1)
        if getattr(res, 'status_code', 200) != 200:
            raise RuntimeError('빅카인즈 HTTP 오류')
        outcome = self.plan.get(day, ('front', TEN_YEARS, None))
        if isinstance(outcome, Exception):
            raise outcome
        kind, days, basis = outcome
        if basis == 'discard':
            self.logger.info(DISCARDED)
            basis = None
        data = {'date': day, 'date_kind': kind, 'shown_date': day, 'kind': kind, 'reason': None, 'basis': basis,
                'articles': [{'news_id': f'a-{day}', 'title': 't', 'content': 'c', 'coverage': None}]}
        table.put_item(Item={'news_id': f'timemachine_frontv2_{day}', 'item_type': 'timemachine_frontv2_cache', 'date': day,
                             'data': data, 'cached_at': 'now', 'expires_at': int(time.time()) + days * 86400})
        return {**data, 'status': 'ok', 'cached': False}


class _ConditionFailed(Exception):
    response = {'Error': {'Code': 'ConditionalCheckFailedException'}}


class _FakeDynamoTable:
    """조건부 PutItem 을 흉내 내는 boto3 Table."""

    def __init__(self, items=()):
        self.items = {i['news_id']: i for i in items}
        self.puts = []

    def get_item(self, Key):
        item = self.items.get(Key['news_id'])
        return {'Item': item} if item else {}

    def put_item(self, Item, ConditionExpression=None, ExpressionAttributeValues=None):
        self.puts.append({'Item': Item, 'ConditionExpression': ConditionExpression})
        old = self.items.get(Item['news_id'])
        if old and old['expires_at'] >= ExpressionAttributeValues[':now']:
            raise _ConditionFailed()
        self.items[Item['news_id']] = Item


def _dynamodb(mode='PAY_PER_REQUEST', **table):
    client = MagicMock()
    client.describe_table.return_value = {'Table': {'TableArn': 'arn:table', 'BillingModeSummary': {'BillingMode': mode}, **table}}
    client.list_tags_of_resource.return_value = {'Tags': [{'Key': 'Service', 'Value': 'atlas4'}]}
    return client


def _args(tmp_path, *extra):
    return wf.parse_args(['--state-dir', str(tmp_path / 'state'), *extra], today=TODAY)


def _range(start, end):
    return ['--from', start, '--to', end]


def _read(tmp_path, name):
    with open(tmp_path / 'state' / name, encoding='utf-8') as fp:
        return fp.read()


def _rows(tmp_path):
    return [json.loads(line) for line in _read(tmp_path, 'results.jsonl').splitlines()]


def _existing(day):
    return {'news_id': f'timemachine_frontv2_{day}', 'item_type': 'timemachine_frontv2_cache', 'date': day,
            'data': {'date': day, 'kind': 'front', 'shown_date': day, 'articles': [{'news_id': 'old'}]},
            'cached_at': 'before', 'expires_at': int(time.time()) + 100 * 86400}


# ─── 인자·구간 ──────────────────────────────────────────────────────────────

def test_default_range_and_argument_checks(tmp_path):
    args = _args(tmp_path)
    assert (args.start, args.end, args.workers, args.dry_run) == ('1990-01-01', '2026-10-14', 3, False)
    assert len(args.days) == (date(2026, 10, 14) - date(1990, 1, 1)).days + 1
    for bad in (['--to', '2026-10-21'], ['--to', '2026-10-22'], ['--code-root', '/old'], ['--from', '1989-12-31'],
                ['--from', '2000-01-02', '--to', '2000-01-01'], ['--workers', '0']):
        with pytest.raises(SystemExit):
            _args(tmp_path, *bad)
    assert _args(tmp_path, '--dry-run', '--code-root', '/old').code_root == '/old'
    dates = tmp_path / 'dates.txt'
    dates.write_text('2024-10-13\n\n2024-10-12\n2024-10-12\n')
    assert _args(tmp_path, '--dates', str(dates)).days == ['2024-10-12', '2024-10-13']


def test_chunks_are_contiguous_ascending_and_complete():
    for count, workers in ((10, 3), (2, 3), (13436, 3), (1, 1)):
        chunks = wf.plan_chunks(count, workers)
        assert len(chunks) == min(count, workers)
        assert chunks[0][0] == 0 and chunks[-1][1] == count - 1
        assert all(a <= b for a, b in chunks) and all(chunks[i][1] + 1 == chunks[i + 1][0] for i in range(len(chunks) - 1))


# ─── 멈춤 조건 ──────────────────────────────────────────────────────────────

def test_stop_after_five_consecutive_failures():
    guard = wf.Guard()
    for failed in (True, True, True, True, False, True, True, True, True):
        guard.record(failed)
    assert guard.reason is None  # 성공 한 번이 연속을 끊는다
    guard.record(True)
    assert guard.reason == '연속 실패 5회'


def test_stop_when_recent_failures_exceed_ten_percent():
    guard = wf.Guard()
    for i in range(100):
        guard.record(i % 10 == 9)  # 100건 중 10건(10%)은 멈추지 않는다
    assert guard.reason is None
    guard.record(True)  # 최근 100건 중 11건
    assert guard.reason.startswith('최근 시도 100건 중 실패 11건')


@pytest.mark.parametrize('res, stops', [
    (_Res(429), True), (_Res(403), True), (_Res(401), True),
    (_Res(200, {'result': 9, 'reason': '일일 호출 한도 초과'}), True),
    (_Res(200, {'result': 9, 'reason': 'Quota exceeded'}), True),
    (_Res(200, {'result': 1, 'reason': 'invalid argument'}), False),
    (_Res(200, {'result': 0}), False),
    (_Res(500), False),
])
def test_response_classification(res, stops):
    assert (wf.stop_reason_for(res) is not None) is stops


def test_quota_reason_never_keeps_key_like_values():
    reason = wf.stop_reason_for(_Res(200, {'result': 9, 'reason': 'limit exceeded for 0123456789abcdef0123456789abcdef'}))
    assert '0123456789abcdef' not in reason and '***' in reason
    big = _Res(200, {'result': 9, 'reason': '한도 초과', 'pad': 'x' * 5000})
    assert wf.stop_reason_for(big) is None  # 큰 응답은 정상 응답으로 보고 열지 않는다


def test_stopped_guard_blocks_requests_and_writes(tmp_path):
    guard, calls, original = wf.Guard(), wf.Calls(), MagicMock()
    post = wf.counting_post(original, _FakeBs(), calls, guard)
    post(_FakeBs.BIGKINDS_ISSUE_URL, json={})
    guard.stop('빅카인즈 HTTP 429')
    with pytest.raises(wf.StopRequested):
        post(_FakeBs.BIGKINDS_SEARCH_URL, json={'argument': {'fields': ['title']}})
    assert original.call_count == 1 and calls.snapshot()['ranking'] == 1
    table = _FakeDynamoTable()
    store = wf.DynamoStore(table, guard, wf.Limiter(None), wf.Limiter(None), str(tmp_path / 'keys.txt'))
    store.put_item(_existing('2010-05-12'))
    assert table.puts == [] and store.pop('2010-05-12')[0] == 'blocked'


def test_call_kinds_are_counted_by_request_shape():
    calls, guard = wf.Calls(), wf.Guard()
    post = wf.counting_post(lambda url, *args, **kw: _Res(), _FakeBs(), calls, guard)
    post(_FakeBs.BIGKINDS_SEARCH_URL, json={'argument': {'fields': ['title', 'content']}})
    post(_FakeBs.BIGKINDS_SEARCH_URL, json={'argument': {'fields': ['title', 'printing_page', 'enveloped_at']}})
    post(_FakeBs.BIGKINDS_SEARCH_URL, json={'argument': {'fields': ['printing_page', 'enveloped_at']}})
    post(_FakeBs.BIGKINDS_ISSUE_URL, json={'argument': {'date': '2010-05-12'}})
    post(_FakeBs.BIGKINDS_SEARCH_URL, {'argument': {'fields': ['title']}}, 10)  # bigkinds_search._post(url, payload, timeout)
    assert calls.snapshot() == {'day': 2, 'ranking': 1, 'front': 1, 'front_count': 1, 'http_error': 0}
    post_429 = wf.counting_post(lambda url, **kw: _Res(429), _FakeBs(), calls, guard)
    post_429(_FakeBs.BIGKINDS_ISSUE_URL, json={})
    assert guard.reason == '빅카인즈 HTTP 429'


# ─── 표 대리 객체 ────────────────────────────────────────────────────────────

def test_real_table_writes_conditionally_and_records_keys(tmp_path):
    table, keys = _FakeDynamoTable([_existing('2010-05-11')]), tmp_path / 'keys.txt'
    store = wf.DynamoStore(table, wf.Guard(), wf.Limiter(None), wf.Limiter(None), str(keys))
    long_item = {**_existing('2010-05-12'), 'expires_at': int(time.time()) + TEN_YEARS * 86400}
    store.put_item(long_item)
    assert table.puts[0]['ConditionExpression'] == 'attribute_not_exists(news_id) OR expires_at < :now'
    assert store.pop('2010-05-12')[0] == 'written' and keys.read_text() == 'timemachine_frontv2_2010-05-12\n'
    # 살아 있는 항목은 덮어쓰지 않는다(조건 실패 = 이미 있음).
    store.put_item({**_existing('2010-05-11'), 'expires_at': int(time.time()) + TEN_YEARS * 86400})
    assert store.pop('2010-05-11')[0] == 'exists' and table.items['timemachine_frontv2_2010-05-11']['cached_at'] == 'before'
    # 보관 1년 미만(잠정)은 쓰지 않는다.
    store.put_item({**_existing('2010-05-10'), 'expires_at': int(time.time()) + WEEK * 86400})
    assert store.pop('2010-05-10')[0] == 'provisional' and len(table.puts) == 2
    assert store.writes == 1 and keys.read_text().splitlines() == ['timemachine_frontv2_2010-05-12']


def test_limiter_never_exceeds_rate():
    now, slept = [0.0], []

    def sleep(seconds):
        slept.append(seconds)
        now[0] += seconds

    limiter = wf.Limiter(2, clock=lambda: now[0], sleep=sleep)
    for _ in range(10):
        limiter.take(1)
    # 처음 1초 몫(2단위)을 빼면 초당 2단위 — 10단위에 4초 이상.
    assert now[0] >= 4 - 1e-9 and 10 <= 2 * now[0] + 2
    wf.Limiter(None, clock=lambda: now[0], sleep=sleep).take(100)
    assert len(slept) == 8


def test_provisioned_table_limits_half_capacity():
    client = _dynamodb('PROVISIONED', ProvisionedThroughput={'ReadCapacityUnits': 20, 'WriteCapacityUnits': 10},
                       GlobalSecondaryIndexes=[
                           {'KeySchema': [{'AttributeName': 'item_type'}, {'AttributeName': 'date'}],
                            'ProvisionedThroughput': {'WriteCapacityUnits': 4}},
                           {'KeySchema': [{'AttributeName': 'user_id'}], 'ProvisionedThroughput': {'WriteCapacityUnits': 1}}])
    limits = wf.capacity_limits(client, 'sedaily-mbti-articles-dev')
    assert (limits['billing_mode'], limits['write_limit'], limits['read_limit']) == ('PROVISIONED', 2, 10)
    on_demand = wf.capacity_limits(_dynamodb(), 'sedaily-mbti-articles-dev')
    assert (on_demand['billing_mode'], on_demand['write_limit']) == ('PAY_PER_REQUEST', None)


# ─── 실행 전체 ──────────────────────────────────────────────────────────────

def test_ten_day_run_counts_and_summary(tmp_path):
    bs = _FakeBs()
    tm = _FakeTm(bs, {'2010-05-04': ('day', WEEK, 'ranking_failed'), '2010-05-06': RuntimeError('boom'),
                      '2010-05-08': ('none', TEN_YEARS, 'discard')})
    table = _FakeDynamoTable([_existing('2010-05-02'), _existing('2010-05-09')])
    err = io.StringIO()
    code = wf.run(_args(tmp_path, *_range('2010-05-01', '2010-05-10')), tm, bs, table=table, dynamodb=_dynamodb(), err=err)
    assert code == 0
    summary = json.loads(_read(tmp_path, 'summary.json'))
    assert {k: summary[k] for k in ('processed', 'written', 'exists', 'failed', 'provisional', 'writes', 'calls_total',
                                    'ranking_discarded', 'stop_reason')} == {
        'processed': 10, 'written': 6, 'exists': 2, 'failed': 1, 'provisional': 1, 'writes': 6, 'calls_total': 8,
        'ranking_discarded': 1, 'stop_reason': None}
    # 이미 있던 날은 GetItem 만 하고 넘어가며 덮어쓰지 않는다.
    assert {p['Item']['date'] for p in table.puts}.isdisjoint({'2010-05-02', '2010-05-09'})
    assert table.items['timemachine_frontv2_2010-05-02']['cached_at'] == 'before'
    assert len(_read(tmp_path, 'written-keys.txt').splitlines()) == 6
    assert _read(tmp_path, 'retry-dates.txt').splitlines() == ['2010-05-04', '2010-05-06']
    rows = {r['date']: r for r in _rows(tmp_path)}
    assert len(rows) == 10 and rows['2010-05-06'] == {**rows['2010-05-06'], 'outcome': 'failed', 'error': 'RuntimeError'}
    assert rows['2010-05-01']['article_ids'] == ['a-2010-05-01'] and len(rows['2010-05-01']['data_sha1']) == 40
    assert json.loads(_read(tmp_path, 'notable.jsonl'))['date'] == '2010-05-08'
    log = err.getvalue()
    assert '과금 모드 PAY_PER_REQUEST' in log and 'Service 태그 atlas4' in log and '동시 빅카인즈 요청 최대 6' in log
    assert '처리 10/10 · 새로 씀 6 · 이미 있음 2 · 실패 1 · 잠정 1 · 빅카인즈 8회' in log and '버린 순위 1' in log
    assert bs._post == bs._send  # 끝나면 감싼 함수를 되돌린다


def test_stop_on_429_then_resume_from_checkpoint(tmp_path):
    def respond(url, payload):
        return _Res(429) if len(bs.sent) == 4 else _Res()

    bs = _FakeBs(respond)
    tm = _FakeTm(bs, {})
    table = _FakeDynamoTable()
    args = _args(tmp_path, *_range('2010-05-01', '2010-05-10'), '--workers', '1')
    assert wf.run(args, tm, bs, table=table, dynamodb=_dynamodb(), err=io.StringIO()) == wf.EXIT_STOPPED
    summary = json.loads(_read(tmp_path, 'summary.json'))
    assert summary['stop_reason'] == '빅카인즈 HTTP 429' and summary['written'] == 3
    assert json.loads(_read(tmp_path, 'checkpoint.json'))['chunks'][0]['next'] == 3  # 멈춘 날(05-04)부터 다시
    assert '멈춤: 빅카인즈 HTTP 429' in _read(tmp_path, 'progress.log')
    # 다시 실행하면 멈춘 날부터 이어 간다. 앞서 쓴 날은 다시 부르지 않는다.
    bs2 = _FakeBs()
    tm2 = _FakeTm(bs2, {})
    assert wf.run(args, tm2, bs2, table=table, dynamodb=_dynamodb(), err=io.StringIO()) == 0
    assert tm2.called == [f'2010-05-{d:02d}' for d in range(4, 11)]
    assert len(_read(tmp_path, 'written-keys.txt').splitlines()) == 10 and len(table.items) == 10
    # 범위나 workers 가 다르면 --restart 없이는 이어 가지 않는다.
    with pytest.raises(SystemExit, match='workers'):
        wf.run(_args(tmp_path, *_range('2010-05-01', '2010-05-10')), tm2, bs2, table=table, dynamodb=_dynamodb())
    assert wf.run(_args(tmp_path, *_range('2010-05-01', '2010-05-10'), '--restart'), _FakeTm(bs2, {}), bs2,
                  table=table, dynamodb=_dynamodb(), err=io.StringIO()) == 0
    # --restart 는 앞 실행 줄을 섞지 않는다(앞 실행 파일은 previous/ 로). 되돌릴 키 목록은 이어 쓴다.
    assert [r['outcome'] for r in _rows(tmp_path)] == ['exists'] * 10
    (previous,) = (tmp_path / 'state' / 'previous').iterdir()
    assert len((previous / 'results.jsonl').read_text().splitlines()) == 10
    assert len(_read(tmp_path, 'written-keys.txt').splitlines()) == 10


@pytest.mark.parametrize('crash_at', ['row', 'checkpoint'])
def test_interrupted_record_resumes_from_same_date(tmp_path, monkeypatch, crash_at):
    """05-03(이슈 순위 실패 — 캐시에 쓰지 않고 retry-dates 로만 남는 날)의 결과 줄을 쓰기 직전(row) 또는 그 줄을 쓴 뒤 체크포인트를
    올리기 직전(checkpoint)에 끊긴다. 디스크의 체크포인트는 05-03 에 머물고, 이어 가면 05-03 부터 다시 해 retry-dates 에 남는다."""
    plan = {'2010-05-03': ('day', WEEK, 'ranking_failed')}
    append, write_json = wf._append_line, wf._write_json

    def broken_append(handle, value):
        if crash_at == 'row' and value.get('date') == '2010-05-03' and 'outcome' in value:
            raise OSError('디스크 오류')
        append(handle, value)

    def broken_write_json(target, value):
        if crash_at == 'checkpoint' and target.endswith('checkpoint.json') and value['chunks'][0]['next'] == 3:
            raise OSError('디스크 오류')
        write_json(target, value)

    monkeypatch.setattr(wf, '_append_line', broken_append)
    monkeypatch.setattr(wf, '_write_json', broken_write_json)
    bs, table = _FakeBs(), _FakeDynamoTable()
    tm = _FakeTm(bs, plan)
    args = _args(tmp_path, *_range('2010-05-01', '2010-05-06'), '--workers', '1')
    assert wf.run(args, tm, bs, table=table, dynamodb=_dynamodb(), err=io.StringIO()) == wf.EXIT_STOPPED
    assert tm.called == ['2010-05-01', '2010-05-02', '2010-05-03']  # 남기지 못하면 다음 날짜로 가지 않는다
    assert json.loads(_read(tmp_path, 'checkpoint.json'))['chunks'][0]['next'] == 2
    assert json.loads(_read(tmp_path, 'summary.json'))['stop_reason'] == '2010-05-03 결과를 남기지 못함(OSError)'
    assert [r['date'] for r in _rows(tmp_path)] == ['2010-05-01', '2010-05-02'] + (['2010-05-03'] if crash_at == 'checkpoint' else [])

    monkeypatch.setattr(wf, '_append_line', append)
    monkeypatch.setattr(wf, '_write_json', write_json)
    tm2 = _FakeTm(bs, plan)
    assert wf.run(args, tm2, bs, table=table, dynamodb=_dynamodb(), err=io.StringIO()) == 0
    assert tm2.called == [f'2010-05-{d:02d}' for d in range(3, 7)]
    assert _read(tmp_path, 'retry-dates.txt').splitlines() == ['2010-05-03']
    assert 'timemachine_frontv2_2010-05-03' not in table.items and len(table.items) == 5


def test_checkpoint_identity_keeps_dry_run_and_real_runs_apart(tmp_path):
    rng = _range('2010-05-01', '2010-05-03')
    bs = _FakeBs()
    assert wf.run(_args(tmp_path, *rng, '--workers', '1', '--dry-run'), _FakeTm(bs, {}), bs, table=None, dynamodb=None,
                  err=io.StringIO()) == 0
    dry = json.loads(_read(tmp_path, 'checkpoint.json'))
    assert dry['dry_run'] is True and dry['code_sha1'] == wf.code_digest(None) and dry['chunks'][0]['next'] == 3
    # dry-run 을 끝낸 폴더에서 --dry-run 만 빼면 완료된 체크포인트로 0건 성공하지 않고 거부한다.
    table, tm = _FakeDynamoTable(), _FakeTm(bs, {})
    with pytest.raises(SystemExit, match='dry-run 여부'):
        wf.run(_args(tmp_path, *rng, '--workers', '1'), tm, bs, table=table, dynamodb=_dynamodb(), err=io.StringIO())
    assert tm.called == [] and table.puts == []
    # 다른 코드 트리의 dry-run 결과도 섞지 않는다.
    with pytest.raises(SystemExit, match='서버 코드'):
        wf.run(_args(tmp_path, *rng, '--workers', '1', '--dry-run', '--code-root', str(tmp_path / 'old')), tm, bs,
               table=None, dynamodb=None, err=io.StringIO())
    assert wf.code_digest(str(tmp_path / 'old')) != wf.code_digest(None)
    # --restart: dry-run 파일은 previous/ 로 옮기고 실제 실행 결과만 남긴다.
    assert wf.run(_args(tmp_path, *rng, '--workers', '1', '--restart'), tm, bs, table=table, dynamodb=_dynamodb(),
                  err=io.StringIO()) == 0
    assert tm.called == ['2010-05-01', '2010-05-02', '2010-05-03'] and len(table.items) == 3
    assert [r['outcome'] for r in _rows(tmp_path)] == ['written'] * 3
    assert json.loads(_read(tmp_path, 'summary.json'))['dry_run'] is False
    assert json.loads(_read(tmp_path, 'checkpoint.json'))['dry_run'] is False
    (previous,) = (tmp_path / 'state' / 'previous').iterdir()
    assert sorted(p.name for p in previous.iterdir()) == ['checkpoint.json', 'notable.jsonl', 'progress.log', 'results.jsonl',
                                                          'retry-dates.txt', 'summary.json']
    assert json.loads((previous / 'summary.json').read_text())['dry_run'] is True
    assert '[dry-run]' not in _read(tmp_path, 'progress.log') and '--restart: 이전 실행 파일을' in _read(tmp_path, 'progress.log')
    assert len(_read(tmp_path, 'written-keys.txt').splitlines()) == 3


def test_dry_run_never_touches_real_table(tmp_path):
    bs = _FakeBs()
    tm = _FakeTm(bs, {})
    real = MagicMock()
    args = _args(tmp_path, *_range('2010-05-01', '2010-05-03'), '--dry-run', '--workers', '1')
    assert wf.run(args, tm, bs, table=real, dynamodb=None, err=io.StringIO()) == 0
    assert real.mock_calls == []
    summary = json.loads(_read(tmp_path, 'summary.json'))
    assert summary['dry_run'] is True and summary['writes'] == 0 and summary['written'] == 3
    assert not (tmp_path / 'state' / 'written-keys.txt').exists()
    assert [r['calls'] for r in _rows(tmp_path)] == [{'day': 1}] * 3  # workers 1 이면 날짜별 호출 수도 남긴다


def test_stop_after_consecutive_failures_in_run(tmp_path):
    bs = _FakeBs()
    tm = _FakeTm(bs, {f'2010-05-{d:02d}': RuntimeError('x') for d in range(1, 11)})
    args = _args(tmp_path, *_range('2010-05-01', '2010-05-10'), '--workers', '1')
    assert wf.run(args, tm, bs, table=_FakeDynamoTable(), dynamodb=_dynamodb(), err=io.StringIO()) == wf.EXIT_STOPPED
    assert json.loads(_read(tmp_path, 'summary.json'))['stop_reason'] == '연속 실패 5회'
    assert tm.called == [f'2010-05-{d:02d}' for d in range(1, 6)]  # 다섯 번째 실패 뒤 새 날짜를 시작하지 않는다


def test_real_run_refuses_without_billing_mode(tmp_path):
    client = MagicMock()
    client.describe_table.side_effect = RuntimeError('denied')
    bs = _FakeBs()
    tm = _FakeTm(bs, {})
    assert wf.run(_args(tmp_path, *_range('2010-05-01', '2010-05-02')), tm, bs, table=MagicMock(), dynamodb=client,
                  err=io.StringIO()) == 1
    assert tm.called == [] and bs.sent == []


def _no_network(*args, **kwargs):
    raise AssertionError('시험이 실제 HTTP 요청을 보냄')


def test_wait_for_rankings_reports_unfinished():
    slots, lines = threading.BoundedSemaphore(2), []
    assert wf.wait_for_rankings(slots, 2, 0.05, lines.append) == 0 and lines == []  # 남은 요청이 없으면 기다리지 않는다
    slots.acquire()  # 끝나지 않는 순위 요청 하나
    assert wf.wait_for_rankings(slots, 2, 0.05, lines.append) == 1
    assert lines == ['남은 이슈 순위 요청 1개가 끝나기를 기다림(최대 0.05초)']
    assert slots.acquire(blocking=False) and not slots.acquire(blocking=False)  # 받은 자리는 돌려 둔다


def test_left_rankings_stay_within_slots_and_late_429_stops(tmp_path, monkeypatch):
    """실제 time_machine 으로 1998년 보관본 공백(그날 기사 0건)인 생일 6일을 workers 2 로 채운다. 생일마다 첫 날 함께 보낸 순위는
    버려지고, 그 응답(429)은 모든 날짜를 처리한 뒤 남은 순위 요청을 기다리기 시작해야 온다. 빅카인즈·DynamoDB·SSM 은 가짜."""
    from handlers.timeline import time_machine as tm
    # time_machine 이 실제로 쓰는 모듈을 고친다. 다른 시험(test_bigkinds_relevance_retry)이 bigkinds_search 를 다시 import 하면
    # `from services.timeline import bigkinds_search` 는 새 모듈을 주고 가짜가 비켜 간다 — 그래서 실제 네트워크도 막는다.
    bs = tm.bigkinds_search
    monkeypatch.setattr(requests.Session, 'send', _no_network)
    for name in ('FRONT_PAGE_TIMEOUT_SECONDS', 'ISSUE_TIMEOUT_SECONDS', 'FRONT_COUNT_TIMEOUT_SECONDS'):
        monkeypatch.setattr(bs, name, getattr(bs, name))  # run 이 바꾸는 값을 시험 뒤 되돌린다
    monkeypatch.setattr(tm, 'FRONT_SEARCH_BUDGET_SECONDS', tm.FRONT_SEARCH_BUDGET_SECONDS)
    monkeypatch.setattr(bs, 'get_secret', lambda name: 'KEY')
    monkeypatch.setattr(bs, '_idle_sessions', [])
    original_slots = tm._ranking_slots
    draining, lock, flight, peak = threading.Event(), threading.Lock(), Counter(), Counter()
    sent, posted = {}, defaultdict(threading.Event)
    send = tm._send_ranking

    def send_ranking(day, deadline):  # 함께 보냈는지 적어 두고, 그 순위 요청이 나간 뒤에야 그날 기사(0건)를 준다
        future = send(day, deadline)
        sent[day] = future is not None
        return future

    class Session:
        def post(self, url, json=None, timeout=None):
            kind = 'ranking' if url == bs.BIGKINDS_ISSUE_URL else 'search'
            with lock:
                for k in (kind, 'all'):
                    flight[k] += 1
                    peak[k] = max(peak[k], flight[k])
            try:
                if kind == 'ranking':
                    posted[json['argument']['date']].set()
                    draining.wait(5)
                    return _Res(429)
                day = json['argument']['published_at']['from']
                if sent.get(day):
                    posted[day].wait(2)
                return _Res(200, {'result': 0, 'return_object': {'documents': []}})
            finally:
                with lock:
                    for k in (kind, 'all'):
                        flight[k] -= 1

        def close(self):
            pass

    class Err(io.StringIO):
        def write(self, text):
            if '남은 이슈 순위 요청' in text:
                draining.set()
            return super().write(text)

    monkeypatch.setattr(tm, '_send_ranking', send_ranking)
    monkeypatch.setattr(bs, '_new_session', Session)
    args = _args(tmp_path, *_range('1998-07-13', '1998-07-18'), '--workers', '2', '--dry-run')
    try:
        code = wf.run(args, tm, bs, table=None, dynamodb=None, err=Err())
    finally:
        draining.set()
        for thread in threading.enumerate():
            if thread.name.startswith('bigkinds-issue'):
                thread.join(5)
    summary = json.loads(_read(tmp_path, 'summary.json'))
    # 늦게 온 429 도 멈춤 이유와 종료 코드에 들어간다.
    assert code == wf.EXIT_STOPPED and summary['stop_reason'] == '빅카인즈 HTTP 429'
    assert {k: summary[k] for k in ('processed', 'written', 'failed', 'rankings_unfinished')} == {
        'processed': 6, 'written': 6, 'failed': 0, 'rankings_unfinished': 0}
    # 생일 6일이 모두 첫 날 순위를 함께 보내려 했지만, 자리 2개가 버린 순위로 차자 나머지는 그날 기사부터 물어 순위를 묻지 않았다.
    assert (summary['calls']['ranking'], summary['ranking_discarded'], peak['ranking']) == (2, 2, 2)
    assert list(sent.values()).count(True) == 2 and peak['all'] <= 2 * 2
    log = _read(tmp_path, 'progress.log')
    assert '남은 이슈 순위 요청 2개가 끝나기를 기다림' in log and '멈춤: 빅카인즈 HTTP 429' in log
    assert tm._ranking_slots is original_slots and bs._post.__name__ == '_post'


# ─── 비교 ────────────────────────────────────────────────────────────────────

def _results(path, rows):
    os.makedirs(path, exist_ok=True)
    with open(os.path.join(path, 'results.jsonl'), 'w', encoding='utf-8') as fp:
        fp.write(''.join(json.dumps(r) + '\n' for r in rows))
    return os.path.join(path, 'results.jsonl')


def _row(day, **over):
    return {'date': day, 'outcome': 'written', 'kind': 'front', 'date_kind': 'front', 'shown_date': day, 'reason': None,
            'basis': None, 'article_ids': ['a'], 'coverage': [None], 'data_sha1': 'x', 'ttl_days': 3650,
            'calls': {'front': 1}, **over}


def test_compare_reports_content_differences_only(tmp_path):
    old = _results(str(tmp_path / 'old'), [_row('2024-10-12'), _row('2024-10-13', ttl_days=0.25, calls={'front': 1}),
                                           _row('2010-05-12', basis='ranking_failed')])
    same = _results(str(tmp_path / 'same'), [_row('2024-10-12'), _row('2024-10-13', calls={}),
                                             _row('2010-05-12', basis='issue', article_ids=['b'])])
    out = io.StringIO()
    assert wf.compare(old, same, out) == 0  # 저장 기간 차이와 ranking_failed 쪽은 다름으로 세지 않는다
    assert '같음 2 · 다름 0 · 비교 제외(실패·멈춤·ranking_failed) 1' in out.getvalue() and '저장 기간이 달라진 날 1' in out.getvalue()
    differ = _results(str(tmp_path / 'differ'), [_row('2024-10-12', article_ids=['b'], calls={'front': 1, 'ranking': 1}),
                                                 _row('2024-10-13')])
    out = io.StringIO()
    assert wf.compare(old, differ, out) == wf.EXIT_DIFF
    assert '다름 2024-10-12: article_ids ["a"] → ["b"]' in out.getvalue()
    assert '새 로직이 더 많이 부른 날 1일 · 그 합 +1회' in out.getvalue()


def test_compare_fails_when_a_date_is_missing(tmp_path):
    old = _results(str(tmp_path / 'old'), [_row('2024-10-12'), _row('2024-10-13'), _row('1992-03-17')])
    cut = _results(str(tmp_path / 'cut'), [_row('2024-10-12'), _row('2024-10-13')])
    out = io.StringIO()
    assert wf.compare(old, cut, out) == wf.EXIT_DIFF  # 공통 날짜가 모두 같아도 잘린 결과는 통과시키지 않는다
    assert '같음 2 · 다름 0' in out.getvalue() and '한쪽에만 있음: 1992-03-17' in out.getvalue()
    assert wf.compare(cut, old, io.StringIO()) == wf.EXIT_DIFF


def test_help_runs_without_aws(capsys):
    with pytest.raises(SystemExit) as exit_info:
        wf.parse_args(['--help'], today=TODAY)
    assert exit_info.value.code == 0 and '--dry-run' in capsys.readouterr().out
