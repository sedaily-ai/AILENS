import json
import unittest
from datetime import date, datetime, timezone
from unittest.mock import patch

import availability
from test_naver_daily import FakeS3, year_file


class AvailabilityTests(unittest.TestCase):
    def test_separates_present_missing_and_unchecked(self):
        s3 = FakeS3({
            'timemachine-newspaper/img/2026/01/20260101.jpg': b'image',
            'timemachine-newspaper/index/v1/2026.json': year_file(2026, [['2026-01-01', '2026-01-02']], ['2026-01-01']),
        })
        doc = availability.build_year(s3, 'b', 2026, date(2026, 1, 3))
        self.assertEqual(doc['days']['2026-01-01']['photo'], 'available')
        self.assertEqual(doc['days']['2026-01-02']['photo'], 'unavailable')
        self.assertEqual(doc['days']['2026-01-03']['photo'], 'unknown')
        self.assertEqual(doc['days']['2026-01-01']['front'], 'available')
        self.assertEqual(doc['days']['2026-01-02']['front'], 'unknown')
        self.assertTrue(doc['days']['2026-01-02']['naver_checked'])
        availability.save_year(s3, 'b', doc, datetime(2026, 1, 3, tzinfo=timezone.utc))
        self.assertEqual(json.loads(s3.objects['timemachine-newspaper/availability/v1/2026.json'])['schema'], 1)
        unchanged = availability.build_year(s3, 'b', 2026, date(2026, 1, 3))
        get = s3.get_object
        with patch.object(s3, 'get_object', side_effect=lambda **kw: {**get(**kw), 'ETag': '"example"'}):
            self.assertEqual(availability.save_year(s3, 'b', unchanged, datetime(2026, 1, 3, tzinfo=timezone.utc)), 'unchanged')
        self.assertEqual(len(s3.puts), 1)

    def test_summary_excludes_unavailable_years(self):
        s3 = FakeS3()
        doc = availability.build_year(s3, 'b', 2026, date(2026, 1, 3))
        availability.save_year(s3, 'b', doc, datetime(2026, 1, 3, tzinfo=timezone.utc))
        summary = availability.build_summary(s3, 'b', date(2026, 1, 3))
        self.assertEqual(list(summary['years']), ['2026'])
        self.assertEqual(summary['years']['2026']['counts']['photo_unknown'], 1)
        availability.save_summary(s3, 'b', summary, datetime(2026, 1, 3, tzinfo=timezone.utc))
        self.assertIn('timemachine-newspaper/availability/v1/summary.json', s3.objects)

    def test_monthly_reconciliation_covers_historical_years(self):
        import daily_handler
        import os
        from datetime import timedelta
        now = datetime(2026, 11, 1, 13, 25, tzinfo=timezone(timedelta(hours=9)))
        report = {'naver': {'count': 0}, 'image': {'count': 0}}
        with patch.dict(os.environ, {'NEWSPAPER_BUCKET': 'b'}, clear=True), \
             patch.object(daily_handler, 'build_missing', return_value=report), \
             patch.object(daily_handler, 'write_missing'), \
             patch.object(daily_handler.availability, 'build_year', side_effect=lambda s, b, y, t: {'year': y}) as build, \
             patch.object(daily_handler.availability, 'save_year'), \
             patch.object(daily_handler.availability_v2, 'build_year', return_value={}), \
             patch.object(daily_handler.availability_v2, 'save_year'), \
             patch.object(daily_handler.availability, 'build_summary', return_value={}), \
             patch.object(daily_handler.availability, 'save_summary'):
            daily_handler.handler({}, None, now=now, s3_client=FakeS3())
        self.assertEqual(build.call_count, 67)

    def test_incomplete_listing_does_not_publish(self):
        s3 = FakeS3()
        with patch.object(s3, 'list_objects_v2', return_value={'IsTruncated': True}):
            with self.assertRaises(ValueError):
                availability.build_year(s3, 'b', 2026, date(2026, 1, 3))
        self.assertEqual(s3.puts, [])

    def test_bad_year_document_does_not_publish(self):
        s3 = FakeS3({'timemachine-newspaper/index/v1/2026.json': b'broken'})
        with self.assertRaises(Exception):
            availability.build_year(s3, 'b', 2026, date(2026, 1, 3))
        self.assertEqual(s3.puts, [])


if __name__ == '__main__':
    unittest.main()

class ScheduledCaptureTests(unittest.TestCase):
    def test_skips_fetch_when_today_has_image_and_record(self):
        import os
        import sys
        from types import SimpleNamespace
        from unittest.mock import Mock
        import lambda_handler

        fake = Mock()
        fake.list_objects_v2.side_effect = lambda **kw: {'Contents': [{'Key': kw['Prefix']}]}
        boto = SimpleNamespace(client=lambda *args, **kwargs: fake)
        with patch.dict(os.environ, {'NEWSPAPER_BUCKET': 'b'}), patch.dict(sys.modules, {'boto3': boto}), patch.object(lambda_handler.ep, 'fetch_latest') as fetch:
            result = lambda_handler.handler({'source': 'aws.events'}, None)
        self.assertEqual(result['status'], 'already_complete')
        fetch.assert_not_called()

    def test_retries_when_one_capture_is_missing(self):
        import os
        import sys
        from types import SimpleNamespace
        from unittest.mock import Mock
        import lambda_handler
        fake = Mock()
        fake.list_objects_v2.side_effect = [{'Contents': [{'Key': 'other'}]}]
        boto = SimpleNamespace(client=lambda *args, **kwargs: fake)
        with patch.dict(os.environ, {'NEWSPAPER_BUCKET': 'b'}), patch.dict(sys.modules, {'boto3': boto}), patch.object(lambda_handler.ep, 'fetch_latest', side_effect=lambda_handler.ep.CaptureError('offline')) as fetch:
            with self.assertRaises(RuntimeError):
                lambda_handler.handler({'source': 'aws.events'}, None)
        fetch.assert_called_once()
