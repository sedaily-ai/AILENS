import json
import unittest
from datetime import date, datetime, timedelta, timezone
from unittest.mock import patch

import cache_index
from test_naver_daily import FakeS3


class S3(FakeS3):
    def get_object(self, **kwargs):
        return {**super().get_object(**kwargs), 'ETag': 'version'}


class CacheIndexTests(unittest.TestCase):
    def test_cached_status_is_indexed_without_article_content(self):
        now = datetime(2026, 11, 9, tzinfo=timezone.utc)
        day = '2026-11-01'
        key = 'timemachine-newspaper/availability/v2/2026.json'
        doc = {'schema': 2, 'year': 2026, 'days': {day: {'bigkinds_day': 'unknown'}}}
        s3 = S3({key: json.dumps(doc).encode()})
        item = {'news_id': 'timemachine_frontv2_' + day, 'expires_at': int(now.timestamp()) + 100,
                'cached_at': '2026-11-09T00:00:00+00:00', 'data': {'date': day, 'kind': 'day',
                'shown_date': day, 'articles': [{'title': 'private title'}]}}
        with patch.object(cache_index, '_read_items', return_value=[item]):
            result = cache_index.run(s3, None, 'b', 'table', date(2026, 11, 9), now=now, max_dates=1)
        saved = json.loads(s3.objects[key])
        self.assertEqual(saved['days'][day]['bigkinds_day'], 'available')
        self.assertNotIn('private title', str(saved))
        self.assertEqual(result['next_date'], '2026-11-02')
        self.assertEqual(s3.puts[-1]['IfNoneMatch'], '*')

    def test_recent_expired_and_mismatched_results_are_not_indexed(self):
        now = datetime(2026, 11, 9, tzinfo=timezone.utc)
        day = date(2026, 11, 8)
        base = {'expires_at': int(now.timestamp()) + 100,
                'cached_at': (now - timedelta(hours=7)).isoformat(),
                'data': {'date': day.isoformat(), 'kind': 'front', 'shown_date': day.isoformat(), 'articles': [1]}}
        self.assertIsNone(cache_index._fact(base, day, date(2026, 11, 9), now))
        base['cached_at'] = now.isoformat()
        base['data']['date'] = '2026-11-07'
        self.assertIsNone(cache_index._fact(base, day, date(2026, 11, 9), now))
        base['data']['date'] = day.isoformat()
        base['expires_at'] = int(now.timestamp()) - 1
        self.assertIsNone(cache_index._fact(base, day, date(2026, 11, 9), now))

    def test_incomplete_dynamo_batch_does_not_advance(self):
        import sys
        import types
        fake_types = types.ModuleType('boto3.dynamodb.types')
        fake_types.TypeDeserializer = lambda: None
        client = type('Client', (), {'batch_get_item': lambda self, **kw: {'UnprocessedKeys': {'table': {}}}})()
        modules = {'boto3': types.ModuleType('boto3'), 'boto3.dynamodb': types.ModuleType('boto3.dynamodb'),
                   'boto3.dynamodb.types': fake_types}
        with patch.dict(sys.modules, modules):
            with self.assertRaises(RuntimeError):
                cache_index._read_items(client, 'table', ['1990-01-01'])

    def test_index_advances_without_wrapping_and_reads_in_batches_of_50(self):
        from unittest.mock import Mock
        end = date(2027, 11, 1)
        s3 = S3({cache_index.CHECKPOINT_KEY: json.dumps({'schema': 1, 'next_date': '2026-11-01'}).encode()})
        read = Mock(return_value=[])
        with patch.object(cache_index, '_read_items', read):
            result = cache_index.run(s3, None, 'b', 'table', end, max_dates=600)
        self.assertEqual(result['next_date'], end.isoformat())
        self.assertEqual(result['processed'], 365)
        self.assertTrue(all(len(call.args[2]) <= 50 for call in read.call_args_list))
        self.assertEqual(len(read.call_args_list), 8)

    def test_failed_read_does_not_advance(self):
        s3 = S3()
        with patch.object(cache_index, '_read_items', side_effect=RuntimeError('offline')):
            with self.assertRaises(RuntimeError):
                cache_index.run(s3, None, 'b', 'table', date(2026, 11, 9))
        self.assertEqual(s3.puts, [])


if __name__ == '__main__':
    unittest.main()
