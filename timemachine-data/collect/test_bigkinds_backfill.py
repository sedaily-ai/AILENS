import io
import json
import unittest
from datetime import date

import bigkinds_backfill as batch
from test_naver_daily import FakeS3


class S3(FakeS3):
    def get_object(self, **kwargs):
        return {**super().get_object(**kwargs), 'ETag': 'version'}


class Lambda:
    def __init__(self, status=200):
        self.status = status
        self.calls = []

    def invoke(self, **kwargs):
        request = json.loads(kwargs['Payload'])
        day = request['queryStringParameters']['front']
        self.calls.append(day)
        return {'Payload': io.BytesIO(json.dumps({'statusCode': self.status,
                 'body': json.dumps({'date': day, 'kind': 'front', 'shown_date': day, 'cached': True, 'articles': []})}).encode())}


class BackfillTests(unittest.TestCase):
    def test_advances_after_success_and_stops_at_limit(self):
        s3, client = S3(), Lambda()
        result = batch.run(s3, client, 'b', 'fn', date(2026, 11, 5), sleep=lambda _: None)
        self.assertEqual(result, {'processed': 2, 'next_date': '2026-11-03'})
        self.assertEqual(client.calls, ['2026-11-01', '2026-11-02'])
        self.assertEqual(s3.puts[0]['IfNoneMatch'], '*')
        self.assertEqual(s3.puts[1]['IfMatch'], 'version')

    def test_failure_does_not_advance(self):
        s3, client = S3(), Lambda(502)
        with self.assertRaises(RuntimeError):
            batch.run(s3, client, 'b', 'fn', date(2026, 11, 5))
        self.assertEqual(s3.puts, [])


    def test_unconfirmed_cache_does_not_advance(self):
        class NotCached(Lambda):
            def invoke(self, **kwargs):
                result = super().invoke(**kwargs)
                response = json.loads(result['Payload'].read())
                data = json.loads(response['body'])
                data['cached'] = False
                response['body'] = json.dumps(data)
                return {'Payload': io.BytesIO(json.dumps(response).encode())}
        s3, client = S3(), NotCached()
        with self.assertRaisesRegex(RuntimeError, '캐시에 저장되지'):
            batch.run(s3, client, 'b', 'fn', date(2026, 11, 5), sleep=lambda _: None)
        self.assertEqual(s3.puts, [])
        self.assertEqual(len(client.calls), 2)

    def test_alternative_date_is_not_marked_as_selected_day(self):
        s3 = S3()
        batch._record_available(s3, 'b', date(1990, 1, 2),
                                {'kind': 'front', 'shown_date': '1990-01-01', 'articles': [{'title': 'x'}]})
        self.assertEqual(s3.puts, [])

    def test_exact_date_records_known_status_without_article_content(self):
        key = 'timemachine-newspaper/availability/v2/1990.json'
        s3 = S3({key: json.dumps({'schema': 2, 'year': 1990, 'days': {'1990-01-02': {}}}).encode()})
        batch._record_available(s3, 'b', date(1990, 1, 2),
                                {'kind': 'day', 'shown_date': '1990-01-02', 'articles': [{'title': 'private'}]})
        saved = json.loads(s3.objects[key])
        self.assertEqual(saved['days']['1990-01-02']['bigkinds_day'], 'available')
        self.assertNotIn('private', str(saved))

    def test_confirmed_absence_is_recorded_for_requested_date(self):
        key = 'timemachine-newspaper/availability/v2/1990.json'
        s3 = S3({key: json.dumps({'schema': 2, 'year': 1990, 'days': {'1990-01-02': {}}}).encode()})
        batch._record_available(s3, 'b', date(1990, 1, 2),
                                {'kind': 'day', 'date_kind': 'day', 'reason': 'no_paper',
                                 'shown_date': '1990-01-01', 'articles': [{'title': 'old'}]})
        saved = json.loads(s3.objects[key])
        self.assertEqual(saved['days']['1990-01-02']['bigkinds_day'], 'unavailable')

    def test_scheduled_errors_retry_twice_before_pausing(self):
        import os
        import sys
        import types
        import daily_handler
        from unittest.mock import patch
        from datetime import datetime, timezone, timedelta
        s3 = S3()
        boto = types.ModuleType('boto3')
        boto.client = lambda *args, **kwargs: object()
        config = types.ModuleType('botocore.config')
        config.Config = lambda **kwargs: object()
        botocore = types.ModuleType('botocore')
        report = {'naver': {'count': 0}, 'image': {'count': 0}}
        now = datetime(2026, 11, 9, 9, 25, tzinfo=timezone(timedelta(hours=9)))
        with patch.dict(os.environ, {'NEWSPAPER_BUCKET': 'b', 'BIGKINDS_BACKFILL_TARGET': 'fn'}, clear=True), \
             patch.dict(sys.modules, {'boto3': boto, 'botocore': botocore, 'botocore.config': config}), \
             patch.object(daily_handler, 'build_missing', return_value=report), \
             patch.object(daily_handler, 'write_missing'), \
             patch.object(batch, 'run', side_effect=RuntimeError('API failure')):
            for attempt in range(3):
                with self.assertRaises(RuntimeError):
                    daily_handler.handler({'source': 'aws.events'}, None, now=now, s3_client=s3)
                self.assertEqual(batch.is_paused(s3, 'b'), attempt == 2)

    def test_rejection_is_identified_and_stops_immediately(self):
        class Refused(Lambda):
            def invoke(self, **kwargs):
                return {'Payload': io.BytesIO(json.dumps({'statusCode': 502, 'body': json.dumps({'code': 'BIGKINDS_REJECTED'})}).encode())}
        with self.assertRaises(batch.Rejected):
            batch.run(S3(), Refused(), 'b', 'fn', date(2026, 11, 5), sleep=lambda _: None)

    def test_success_resets_previous_failures(self):
        s3 = S3()
        self.assertEqual(batch.note_failure(s3, 'b'), 1)
        batch.clear_failures(s3, 'b')
        self.assertEqual(batch._failure_state(s3, 'b')[0], 0)

    def test_pause_persists_and_is_detected(self):
        from datetime import datetime, timezone
        s3 = S3()
        self.assertFalse(batch.is_paused(s3, 'b'))
        batch.pause(s3, 'b', datetime(2026, 11, 9, tzinfo=timezone.utc))
        self.assertTrue(batch.is_paused(s3, 'b'))

    def test_recent_refresh_uses_yesterday(self):
        s3, client = S3(), Lambda()
        result = batch.refresh_recent(s3, client, 'b', 'fn', date(2026, 11, 9), sleep=lambda _: None)
        self.assertEqual(result, {'processed': 1, 'date': '2026-11-08'})
        self.assertEqual(client.calls, ['2026-11-08'])

    def test_low_remaining_time_does_not_invoke(self):
        s3, client = S3(), Lambda()
        self.assertEqual(batch.run(s3, client, 'b', 'fn', date(1990, 1, 5), remaining_ms=lambda: 1000)['processed'], 0)
        self.assertEqual(client.calls, [])


if __name__ == '__main__':
    unittest.main()
