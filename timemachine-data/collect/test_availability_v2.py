import unittest
import json
from datetime import datetime, timezone
from datetime import date
from unittest.mock import patch

import availability_v2
from test_naver_daily import FakeS3, year_file


class AvailabilityV2Tests(unittest.TestCase):
    def test_sources_are_separate_and_epaper_does_not_imply_front_article(self):
        s3 = FakeS3({
            'timemachine-newspaper/img/2026/01/20260101.jpg': b'image',
            'timemachine-newspaper/epaper/2026/01/20260101.json': b'{}',
            'timemachine-newspaper/epaper/2026/02/20260102.json': b'{}',
            'timemachine-newspaper/index/v1/2026.json': year_file(2026, [['2026-01-01', '2026-01-02']], ['2026-01-01']),
        })
        with patch.object(availability_v2, 'load_calendar', return_value=([], set(), set(), None)):
            days = availability_v2.build_year(s3, 'b', 2026, date(2026, 1, 3))['days']
        self.assertEqual(days['2026-01-01']['photo'], 'available')
        self.assertEqual(days['2026-01-01']['naver_front'], 'available')
        self.assertEqual(days['2026-01-01']['epaper_record'], 'available')
        self.assertEqual(days['2026-01-01']['bigkinds_front'], 'unknown')
        self.assertEqual(days['2026-01-02']['epaper_record'], 'unknown')
        self.assertEqual(days['2026-01-03']['photo'], 'unknown')


    def test_calendar_excludes_unchecked_sunday_and_unknown_dates(self):
        s3 = FakeS3()
        info = ([(date(2026, 1, 1), date(2026, 1, 4))], {date(2026, 1, 2)},
                {date(2026, 1, 3)}, '2026-01-04T12:00:00+09:00')
        with patch.object(availability_v2, 'load_calendar', return_value=info):
            days = availability_v2.build_year(s3, 'b', 2026, date(2026, 1, 4))['days']
        self.assertEqual(days['2026-01-01']['bigkinds_front'], 'available')
        self.assertEqual(days['2026-01-02']['bigkinds_front'], 'unavailable')
        self.assertEqual(days['2026-01-03']['bigkinds_front'], 'unknown')
        self.assertEqual(days['2026-01-04']['bigkinds_front'], 'unknown')

    def test_saved_bigkinds_status_survives_photo_refresh(self):
        previous = {'schema': 2, 'year': 2026, 'through': '2026-01-01', 'updated_at': 'old',
                    'days': {'2026-01-01': {'photo': 'unavailable', 'naver_front': 'unknown',
                             'epaper_record': 'unknown', 'bigkinds_front': 'available',
                             'bigkinds_day': 'unknown', 'bigkinds_checked_at': '2026-01-01'}}}
        key = 'timemachine-newspaper/availability/v2/2026.json'
        s3 = FakeS3({key: json.dumps(previous).encode()})
        doc = {'schema': 2, 'year': 2026, 'through': '2026-01-01', 'days': {
            '2026-01-01': {'photo': 'available', 'naver_front': 'unknown',
                           'epaper_record': 'unknown', 'bigkinds_front': 'unknown', 'bigkinds_day': 'unknown'}}}
        get = s3.get_object
        with patch.object(s3, 'get_object', side_effect=lambda **kw: {**get(**kw), 'ETag': 'v1'}):
            availability_v2.save_year(s3, 'b', doc, datetime(2026, 1, 2, tzinfo=timezone.utc))
        saved = json.loads(s3.objects[key])
        self.assertEqual(saved['days']['2026-01-01']['bigkinds_front'], 'available')
        self.assertEqual(saved['days']['2026-01-01']['photo'], 'available')
        self.assertEqual(s3.puts[-1]['IfMatch'], 'v1')

    def test_daily_handler_writes_v1_and_v2_without_epaper_becoming_an_article(self):
        import daily_handler
        import os
        from datetime import timedelta
        s3 = FakeS3({'timemachine-newspaper/epaper/2026/01/20260101.json': b'{}'})
        report = {'naver': {'count': 0}, 'image': {'count': 0}}
        now = datetime(2026, 1, 3, 9, 25, tzinfo=timezone(timedelta(hours=9)))
        with patch.dict(os.environ, {'NEWSPAPER_BUCKET': 'b'}, clear=True), \
             patch.object(daily_handler, 'build_missing', return_value=report), \
             patch.object(daily_handler, 'write_missing'), \
             patch.object(availability_v2, 'load_calendar', return_value=([], set(), set(), None)):
            daily_handler.handler({'availability_years': [2026]}, None, now=now, s3_client=s3)
        self.assertIn('timemachine-newspaper/availability/v1/2026.json', s3.objects)
        row = json.loads(s3.objects['timemachine-newspaper/availability/v2/2026.json'])['days']['2026-01-01']
        self.assertEqual(row['epaper_record'], 'available')
        self.assertEqual(row['bigkinds_front'], 'unknown')

    def test_incomplete_epaper_listing_is_an_error(self):
        s3 = FakeS3()
        original = s3.list_objects_v2
        def listing(**args):
            if '/epaper/' in args['Prefix']:
                return {'IsTruncated': True}
            return original(**args)
        with patch.object(s3, 'list_objects_v2', side_effect=listing):
            with self.assertRaises(ValueError):
                availability_v2.build_year(s3, 'b', 2026, date(2026, 1, 3))


if __name__ == '__main__':
    unittest.main()
