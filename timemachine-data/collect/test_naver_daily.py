"""naver_daily.py · daily_handler.py 시험 — 네이버·AWS 없이 돈다.  실행: cd timemachine-data/collect && python3 -m unittest test_naver_daily -v"""
import contextlib
import io
import json
import unittest
import urllib.error
from datetime import date, datetime, timedelta, timezone
from unittest import mock

import daily_handler as dh
import naver_daily as nd

KST = timezone(timedelta(hours=9))
D = date.fromisoformat


def at(text, hour=9):
    """KST text(YYYY-MM-DD) hour 시를 UTC datetime 으로."""
    y, m, d = (int(x) for x in text.split('-'))
    return datetime(y, m, d, hour, 0, tzinfo=KST).astimezone(timezone.utc)


def page(items=3, notice=False):
    """네이버 신문보기 HTML 조각(1면 블록). notice=True 면 '발행된 종이신문이 없거나…' 안내."""
    if notice:
        return '<div>발행된 종이신문이 없거나 신문게재 정보가 입력되지 않았습니다.</div>'
    lis = ''.join(f'<li><a href="https://n.news.naver.com/mnews/article/011/00000{i}00{i}"><strong>제목 {i}</strong></a></li>' for i in range(1, items + 1))
    return f'<span class="page_notation"><em>1</em>면</span><ul>{lis}</ul><div class="newspaper_brick_item">'


class FakeS3:
    """list_objects_v2 / get_object / put_object 를 흉내 낸다. objects: key -> bytes."""

    def __init__(self, objects=None):
        self.objects = dict(objects or {})
        self.puts = []

    def list_objects_v2(self, Bucket, Prefix, MaxKeys=1000, ContinuationToken=None):
        keys = sorted(k for k in self.objects if k.startswith(Prefix))
        return {'Contents': [{'Key': k, 'Size': len(self.objects[k])} for k in keys][:MaxKeys], 'IsTruncated': False}

    def get_object(self, Bucket, Key):
        return {'Body': io.BytesIO(self.objects[Key])}

    def put_object(self, **kwargs):
        self.puts.append(kwargs)
        self.objects[kwargs['Key']] = kwargs['Body']


def year_file(year, covers, days=None):
    doc = {'schema': 1, 'year': year, 'updated_at': 'x', 'text_covers': covers,
           'days': {d: {'articles': [{'rank': 1, 'title': 't', 'url': 'https://n.news.naver.com/a'}]} for d in (days or [])}}
    return json.dumps(doc).encode('utf-8')


def saved_year(s3, year):
    return json.loads(s3.objects[f'timemachine-newspaper/index/v1/{year}.json'])


class Pages(unittest.TestCase):
    def test_reads_front_page_articles_in_naver_order(self):
        articles = nd.read_page(page(items=3), D('2026-11-02'))
        self.assertEqual([a['rank'] for a in articles], [1, 2, 3])
        self.assertEqual(articles[0]['title'], '제목 1')
        self.assertTrue(articles[0]['url'].startswith('https://n.news.naver.com/'))

    def test_notice_means_no_front_page(self):
        self.assertIsNone(nd.read_page(page(notice=True), D('2026-11-01')))

    def test_changed_structure_is_an_error_not_an_empty_day(self):
        with self.assertRaisesRegex(nd.NaverError, '구조가 달라졌어요'):
            nd.read_page('<html>다른 화면</html>', D('2026-11-02'))

    def test_non_https_links_are_rejected(self):
        bad = page().replace('https://n.news', 'http://n.news')
        with self.assertRaisesRegex(nd.NaverError, '형식이 달라졌어요'):
            nd.read_page(bad, D('2026-11-02'))


class Fetch(unittest.TestCase):
    def opener_returning(self, *outcomes):
        calls = []

        def opener(request, timeout):
            calls.append(request)
            outcome = outcomes[min(len(calls), len(outcomes)) - 1]
            if isinstance(outcome, Exception):
                raise outcome
            return contextlib.nullcontext(io.BytesIO(outcome.encode('utf-8')))
        return opener, calls

    def http_error(self, code):
        return urllib.error.HTTPError('https://x', code, 'm', {}, None)

    def test_identifies_itself_and_asks_for_the_right_date(self):
        opener, calls = self.opener_returning('ok')
        self.assertEqual(nd.fetch_page(D('2026-11-02'), opener=opener, sleep=lambda s: None), 'ok')
        self.assertIn('date=20261102', calls[0].full_url)
        self.assertIn('/press/011/', calls[0].full_url)
        self.assertTrue(calls[0].get_header('User-agent').startswith('SedailyLENS-timemachine/'))

    def test_retries_three_times_then_fails(self):
        opener, calls = self.opener_returning(self.http_error(500))
        sleeps = []
        with self.assertRaisesRegex(nd.NaverError, '받기 실패'):
            nd.fetch_page(D('2026-11-02'), opener=opener, sleep=sleeps.append)
        self.assertEqual((len(calls), sleeps), (3, [2, 4]))

    def test_recovers_after_a_transient_failure(self):
        opener, calls = self.opener_returning(OSError('reset'), 'ok')
        self.assertEqual(nd.fetch_page(D('2026-11-02'), opener=opener, sleep=lambda s: None), 'ok')
        self.assertEqual(len(calls), 2)

    def test_blocked_stops_immediately_without_retry(self):
        for code in (403, 429):
            opener, calls = self.opener_returning(self.http_error(code))
            with self.subTest(code=code), self.assertRaises(nd.Blocked):
                nd.fetch_page(D('2026-11-02'), opener=opener, sleep=lambda s: None)
            self.assertEqual(len(calls), 1)


class YearDoc(unittest.TestCase):
    def test_add_cover_merges_touching_spans(self):
        self.assertEqual(nd.add_cover([['2026-01-01', '2026-11-03']], D('2026-11-04')), [['2026-01-01', '2026-11-04']])
        self.assertEqual(nd.add_cover([['2026-01-01', '2026-11-03']], D('2026-11-05')), [['2026-01-01', '2026-11-03'], ['2026-11-05', '2026-11-05']])
        # 사이를 메우면 둘이 합쳐진다
        self.assertEqual(nd.add_cover([['2026-01-01', '2026-11-03'], ['2026-11-05', '2026-11-05']], D('2026-11-04')), [['2026-01-01', '2026-11-05']])
        self.assertEqual(nd.add_cover([], D('2026-11-04')), [['2026-11-04', '2026-11-04']])

    def test_apply_day_never_erases_an_existing_list(self):
        doc = nd.new_year_doc(2026)
        doc['days']['2026-11-02'] = {'articles': [{'rank': 1, 'title': 't', 'url': 'https://x/'}]}
        self.assertEqual(nd.apply_day(doc, D('2026-11-02'), None, 'now'), 'kept')
        self.assertIn('2026-11-02', doc['days'])
        self.assertEqual(doc['text_covers'], [])   # 건드리지 않았다

    def test_load_year_creates_a_new_doc_only_when_missing(self):
        self.assertEqual(nd.load_year(FakeS3(), 'b', 2026)['text_covers'], [])
        s3 = FakeS3({'timemachine-newspaper/index/v1/2026.json': b'{'})
        with self.assertRaisesRegex(nd.NaverError, '덮어쓰지 않았어요'):
            nd.load_year(s3, 'b', 2026)
        wrong = FakeS3({'timemachine-newspaper/index/v1/2026.json': json.dumps({'schema': 2, 'year': 2026}).encode()})
        with self.assertRaisesRegex(nd.NaverError, '형식이 달라요'):
            nd.load_year(wrong, 'b', 2026)

    def test_similar_key_is_not_the_year_file(self):
        s3 = FakeS3({'timemachine-newspaper/index/v1/2026.json.bak': b'{}'})
        self.assertEqual(nd.load_year(s3, 'b', 2026)['days'], {})


class Targets(unittest.TestCase):
    def test_pending_skips_known_days_and_today_outside_the_window(self):
        # lookback=3 이면 11-04 기준 11-01 까지 본다. 11-01·11-02 는 이미 확인했다.
        covered = {D('2026-11-01'), D('2026-11-02')}
        self.assertEqual(nd.pending_dates(D('2026-11-04'), 9, covered, lookback=3), [D('2026-11-03'), D('2026-11-04')])
        self.assertEqual(nd.pending_dates(D('2026-11-04'), 3, covered, lookback=3), [D('2026-11-03')])    # 오늘은 6시 전이라 아직
        self.assertEqual(nd.pending_dates(D('2026-11-04'), 15, covered, lookback=3), [D('2026-11-03')])   # 14시 뒤에는 오늘 목록을 받지 않는다
        # 하루 더 거슬러 보면 확인 안 한 10-31 도 대상이다(오래된 날부터)
        self.assertEqual(nd.pending_dates(D('2026-11-04'), 9, covered, lookback=4), [D('2026-10-31'), D('2026-11-03'), D('2026-11-04')])

    def test_pending_never_goes_before_naver_started(self):
        self.assertEqual(nd.pending_dates(D('2011-07-10'), 9, set(), lookback=7), [D('2011-07-09'), D('2011-07-10')])

    def test_explicit_dates_and_ranges(self):
        today = D('2026-11-04')
        self.assertEqual(nd.parse_targets({'dates': ['2026-11-03', '2026-11-02', '2026-11-03']}, today), ([D('2026-11-02'), D('2026-11-03')], False))
        days, force = nd.parse_targets({'from': '2026-11-01', 'to': '2026-11-03', 'force': True}, today)
        self.assertEqual((len(days), force), (3, True))
        self.assertIsNone(nd.parse_targets({}, today))
        self.assertIsNone(nd.parse_targets({'other': 1}, today))

    def test_explicit_requests_are_validated(self):
        today = D('2026-11-04')
        for event, message in (({'dates': ['2026-13-01']}, 'YYYY-MM-DD'), ({'from': '2026-11-01'}, 'YYYY-MM-DD'),
                               ({'from': '2026-11-03', 'to': '2026-11-01'}, '늦어요'), ({'dates': ['2026-11-05']}, '오늘'),
                               ({'dates': ['2011-07-08']}, '2011-07-09'), ({'from': '2026-01-01', 'to': '2026-03-01'}, '31일')):
            with self.subTest(event=event), self.assertRaisesRegex(ValueError, message):
                nd.parse_targets(event, today)


class Collect(unittest.TestCase):
    def run_collect(self, s3, days, fetch, now=None, **kw):
        return nd.collect(days, s3=s3, bucket='b', now=now or at('2026-11-04'), fetch=fetch, sleep=lambda s: None, **kw)

    def test_saves_list_and_extends_cover_for_a_past_day(self):
        s3 = FakeS3({'timemachine-newspaper/index/v1/2026.json': year_file(2026, [['2026-01-01', '2026-11-02']], ['2026-11-02'])})
        result = self.run_collect(s3, [D('2026-11-03')], lambda d: page(items=4))
        self.assertEqual(result, {'2026-11-03': 'saved'})
        doc = saved_year(s3, 2026)
        self.assertEqual(doc['text_covers'], [['2026-01-01', '2026-11-03']])
        self.assertEqual([a['rank'] for a in doc['days']['2026-11-03']['articles']], [1, 2, 3, 4])
        self.assertIn('2026-11-02', doc['days'])   # 있던 날은 그대로
        put = s3.puts[0]
        self.assertEqual((put['Key'], put['CacheControl']), ('timemachine-newspaper/index/v1/2026.json', 'public, max-age=600'))

    def test_past_day_without_a_list_is_confirmed_as_no_list(self):
        s3 = FakeS3()
        self.assertEqual(self.run_collect(s3, [D('2026-11-03')], lambda d: page(notice=True)), {'2026-11-03': 'no_list'})
        doc = saved_year(s3, 2026)
        self.assertEqual((doc['text_covers'], doc['days']), ([['2026-11-03', '2026-11-03']], {}))

    def test_today_without_a_list_is_pending_and_not_confirmed(self):
        s3 = FakeS3()
        self.assertEqual(self.run_collect(s3, [D('2026-11-04')], lambda d: page(notice=True)), {'2026-11-04': 'pending'})
        self.assertEqual(s3.puts, [])   # 아무것도 쓰지 않는다

    def test_today_with_a_list_is_saved(self):
        s3 = FakeS3()
        self.assertEqual(self.run_collect(s3, [D('2026-11-04')], lambda d: page()), {'2026-11-04': 'saved'})

    def test_sunday_is_confirmed_without_a_request(self):
        s3, fetch = FakeS3(), mock.Mock(return_value=page())
        self.assertEqual(self.run_collect(s3, [D('2026-11-01')], fetch), {'2026-11-01': 'sunday'})
        fetch.assert_not_called()
        self.assertEqual(saved_year(s3, 2026)['text_covers'], [['2026-11-01', '2026-11-01']])

    def test_covered_days_are_skipped_unless_forced(self):
        s3 = FakeS3({'timemachine-newspaper/index/v1/2026.json': year_file(2026, [['2026-01-01', '2026-11-03']])})
        fetch = mock.Mock(return_value=page())
        self.assertEqual(self.run_collect(s3, [D('2026-11-02')], fetch), {'2026-11-02': 'covered'})
        fetch.assert_not_called()
        self.assertEqual(s3.puts, [])
        self.assertEqual(self.run_collect(s3, [D('2026-11-02')], fetch, force=True), {'2026-11-02': 'saved'})

    def test_a_failed_day_is_not_confirmed_and_does_not_stop_the_rest(self):
        s3 = FakeS3()

        def fetch(day):
            if day == D('2026-11-02'):
                raise nd.NaverError('2026-11-02 받기 실패(HTTP 500)')
            return page()
        result = self.run_collect(s3, [D('2026-11-02'), D('2026-11-03')], fetch)
        self.assertEqual(result['2026-11-03'], 'saved')
        self.assertTrue(result['2026-11-02'].startswith('error:'))
        self.assertEqual(saved_year(s3, 2026)['text_covers'], [['2026-11-03', '2026-11-03']])   # 실패한 날은 확인 처리하지 않았다

    def test_blocked_saves_what_was_done_then_stops_and_keeps_results(self):
        s3 = FakeS3()

        def fetch(day):
            if day == D('2026-11-03'):
                raise nd.Blocked('네이버가 요청을 막았어요(HTTP 429)')
            return page()
        with self.assertRaises(nd.Blocked) as ctx:
            self.run_collect(s3, [D('2026-11-02'), D('2026-11-03'), D('2026-11-04')], fetch)
        self.assertEqual(ctx.exception.results['2026-11-02'], 'saved')
        self.assertTrue(ctx.exception.results['2026-11-03'].startswith('error:'))
        self.assertNotIn('2026-11-04', ctx.exception.results)   # 막힌 뒤에는 더 요청하지 않는다
        self.assertEqual(saved_year(s3, 2026)['text_covers'], [['2026-11-02', '2026-11-02']])

    def test_requests_are_spaced_and_a_year_boundary_writes_both_files(self):
        s3, sleeps = FakeS3(), []
        nd.collect([D('2025-12-30'), D('2026-01-02')], s3=s3, bucket='b', now=at('2026-01-05'), fetch=lambda d: page(), sleep=sleeps.append)
        self.assertEqual(sleeps, [0.7])
        self.assertEqual(sorted(p['Key'] for p in s3.puts), ['timemachine-newspaper/index/v1/2025.json', 'timemachine-newspaper/index/v1/2026.json'])

    def test_unreadable_existing_year_file_is_never_overwritten(self):
        s3 = FakeS3({'timemachine-newspaper/index/v1/2026.json': b'{'})
        result = self.run_collect(s3, [D('2026-11-03')], lambda d: page())
        self.assertTrue(result['2026-11-03'].startswith('error:'))
        self.assertEqual(s3.puts, [])


class Handler(unittest.TestCase):
    def setUp(self):
        env = mock.patch.dict('os.environ', {'NEWSPAPER_BUCKET': 'b', 'AWS_REGION': 'us-east-1', 'NAVER_DAILY': 'on', 'NAVER_DAILY_FROM': '2026-11-03'})
        env.start()
        self.addCleanup(env.stop)

    def run_handler(self, s3, event=None, now=None, fetch=None):
        out = io.StringIO()
        with mock.patch.object(nd, 'fetch_page', fetch or (lambda d: page())), mock.patch.object(nd.time, 'sleep', lambda s: None), \
                contextlib.redirect_stdout(out):
            try:
                result = dh.handler(event or {}, None, now=now or at('2026-11-04'), s3_client=s3)
                error = None
            except RuntimeError as e:
                result, error = None, str(e)
        lines = [json.loads(line) for line in out.getvalue().strip().splitlines() if line]
        return result, error, lines

    def test_off_by_default_makes_no_naver_request_but_still_reports_missing(self):
        s3 = FakeS3()
        with mock.patch.dict('os.environ', {'NAVER_DAILY': '', 'NAVER_DAILY_FROM': ''}):
            fetch = mock.Mock(return_value=page())
            result, error, lines = self.run_handler(s3, fetch=fetch)
        fetch.assert_not_called()
        self.assertIsNone(error)
        self.assertFalse(result['enabled'])
        # 연도 파일은 쓰지 않고, 누락 목록(이미지 쪽)만 비공개 위치에 쓴다
        self.assertEqual([p['Key'] for p in s3.puts], ['ops/status/missing.json'])
        self.assertEqual(json.loads(s3.puts[0]['Body'])['naver']['count'], 0)
        metric = next(line for line in lines if '_aws' in line)
        self.assertEqual((metric['NaverSaved'], metric['NaverBlocked'], metric['NaverMissingDays']), (0, 0, 0))

    def test_on_requires_a_daily_start_date(self):
        with mock.patch.dict('os.environ', {'NAVER_DAILY_FROM': ''}):
            fetch = mock.Mock(return_value=page())
            _, error, _ = self.run_handler(FakeS3(), fetch=fetch)
        self.assertIn('NAVER_DAILY_FROM', error)
        fetch.assert_not_called()
        with mock.patch.dict('os.environ', {'NAVER_DAILY_FROM': '내일'}):
            self.assertIn('형식', self.run_handler(FakeS3(), fetch=fetch)[1])

    def test_off_rejects_an_explicit_reprocess_request(self):
        with mock.patch.dict('os.environ', {'NAVER_DAILY': ''}):
            _, error, _ = self.run_handler(FakeS3(), event={'dates': ['2026-11-03']})
        self.assertIn('NAVER_DAILY', error)

    def test_hourly_run_collects_only_the_unconfirmed_days(self):
        s3 = FakeS3({'timemachine-newspaper/index/v1/2026.json': year_file(2026, [['2026-01-01', '2026-11-02']])})
        fetched = []
        result, error, _ = self.run_handler(s3, fetch=lambda d: fetched.append(d) or page())
        self.assertIsNone(error)
        self.assertEqual(fetched, [D('2026-11-03'), D('2026-11-04')])
        self.assertEqual(result['counts'], {'saved': 2})

    def test_explicit_dates_reprocess_with_force(self):
        s3 = FakeS3({'timemachine-newspaper/index/v1/2026.json': year_file(2026, [['2026-01-01', '2026-11-03']], ['2026-11-02'])})
        fetched = []
        result, _, _ = self.run_handler(s3, event={'dates': ['2026-11-02'], 'force': True}, fetch=lambda d: fetched.append(d) or page(items=2))
        self.assertEqual(fetched, [D('2026-11-02')])
        self.assertEqual(len(saved_year(s3, 2026)['days']['2026-11-02']['articles']), 2)
        self.assertTrue(result['explicit'])

    def test_bad_explicit_request_fails_before_any_request(self):
        fetch = mock.Mock()
        _, error, _ = self.run_handler(FakeS3(), event={'dates': ['2026-99-99']}, fetch=fetch)
        self.assertIn('YYYY-MM-DD', error)
        fetch.assert_not_called()

    def test_failures_end_the_invocation_as_an_error_so_lambda_errors_alarms(self):
        def fetch(day):
            raise nd.NaverError(f'{day} 받기 실패(HTTP 500)')
        _, error, lines = self.run_handler(FakeS3(), fetch=fetch)
        self.assertIn('받지 못했어요', error)
        self.assertTrue(any(line.get('errors') for line in lines))

    def test_blocked_is_reported_as_an_error_and_a_metric(self):
        def fetch(day):
            raise nd.Blocked('네이버가 요청을 막았어요(HTTP 429)')
        _, error, lines = self.run_handler(FakeS3(), fetch=fetch)
        self.assertIn('막았어요', error)
        metric = next(line for line in lines if '_aws' in line)
        self.assertEqual(metric['NaverBlocked'], 1)


class Missing(unittest.TestCase):
    def img(self, *days):
        return {f'timemachine-newspaper/img/{d[:4]}/{d[5:7]}/{d.replace("-", "")}.jpg': b'x' for d in days}

    def test_naver_missing_counts_only_from_the_daily_start_and_lists_newest_first(self):
        # 일일 수집 시작일 10-25. 확인한 기간은 2026-01-01~10-30. 11-01(일)과 최근 이틀(11-03·11-04)은 세지 않는다.
        s3 = FakeS3({'timemachine-newspaper/index/v1/2026.json': year_file(2026, [['2026-01-01', '2026-10-30']])})
        report = dh.build_missing(s3, 'b', at('2026-11-04'), D('2026-10-25'))
        self.assertEqual(report['naver']['dates'], ['2026-11-02', '2026-10-31'])   # 최근 것부터
        self.assertEqual(report['naver']['count'], 2)
        self.assertNotIn('2026-11-01', report['naver']['dates'])
        self.assertEqual(report['naver_from'], '2026-10-25')

    def test_past_years_are_backfill_information_not_a_daily_miss(self):
        # 시작일 이전 2011-07-09~ 은 누락이 아니라 백필 개수로만 적는다. 연도 파일이 하나도 없어도 naver 누락은 0.
        report = dh.build_missing(FakeS3(), 'b', at('2026-11-04'), D('2026-11-04'))
        self.assertEqual(report['naver']['count'], 0)
        self.assertGreater(report['naver_backfill'], 4000)

    def test_naver_is_not_counted_when_the_daily_collection_is_off(self):
        report = dh.build_missing(FakeS3(), 'b', at('2026-11-04'))
        self.assertEqual(report['naver'], {'count': 0, 'dates': [], 'truncated': False})
        self.assertIsNone(report['naver_from'])

    def test_listing_is_capped_but_counted_fully(self):
        report = dh.build_missing(FakeS3(), 'b', at('2026-11-04'), D('2026-01-01'))
        self.assertGreater(report['naver']['count'], dh.LIST_LIMIT)
        self.assertEqual(len(report['naver']['dates']), dh.LIST_LIMIT)
        self.assertTrue(report['naver']['truncated'])
        self.assertEqual(report['naver']['dates'][0], '2026-11-02')   # 잘려도 가장 최근 누락이 먼저 있다

    def test_image_missing_waits_for_the_deadline_hour_and_skips_sundays(self):
        photos = self.img('2026-11-03', '2026-11-04')
        before = dh.build_missing(FakeS3(photos), 'b', at('2026-11-04', hour=9))
        self.assertEqual(before['image']['dates'], [])
        s3 = FakeS3(self.img('2026-11-03'))
        late = dh.build_missing(s3, 'b', at('2026-11-04', hour=13))
        self.assertEqual(late['image']['dates'], ['2026-11-04'])
        sunday = dh.build_missing(FakeS3(self.img('2026-11-03', '2026-11-04', '2026-11-05', '2026-11-06', '2026-11-07')), 'b', at('2026-11-08', hour=13))
        self.assertEqual(sunday['image']['dates'], [])   # 11-08 은 일요일이라 사진이 없어도 누락이 아니다

    def test_image_missing_for_a_past_day_is_listed(self):
        report = dh.build_missing(FakeS3(self.img('2026-11-03', '2026-11-05')), 'b', at('2026-11-06', hour=9))
        self.assertEqual(report['image']['dates'], ['2026-11-04'])

    def test_missing_report_is_written_outside_the_public_prefix(self):
        s3 = FakeS3()
        report = dh.build_missing(s3, 'b', at('2026-11-04'))
        dh.write_missing(s3, 'b', report)
        put = s3.puts[-1]
        self.assertEqual(put['Key'], 'ops/status/missing.json')
        self.assertFalse(put['Key'].startswith('timemachine-newspaper/'))
        self.assertEqual(put['CacheControl'], 'no-store')
        self.assertEqual(json.loads(put['Body'])['schema'], 1)


class Metrics(unittest.TestCase):
    def test_emf_line_matches_the_cloudwatch_embedded_format(self):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            dh._emf(NaverSaved=2, NaverErrors=0)
        line = json.loads(out.getvalue())
        directive = line['_aws']['CloudWatchMetrics'][0]
        self.assertEqual(directive['Namespace'], 'Sedaily/LENS/TimemachineNewspaper')
        self.assertEqual({m['Name'] for m in directive['Metrics']}, {'NaverSaved', 'NaverErrors'})
        for metric in directive['Metrics']:
            self.assertIn(metric['Name'], line)           # 지표 이름마다 같은 이름의 값이 있어야 한다
            self.assertIsInstance(line[metric['Name']], (int, float))
        self.assertIsInstance(line['_aws']['Timestamp'], int)


if __name__ == '__main__':
    unittest.main()
