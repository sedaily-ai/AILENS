"""check_images.py 의 올린 뒤 대조(compare) 시험 — 이미지·네트워크·AWS 없이 돈다.  실행: cd timemachine-data/upload && python3 -m unittest test_check_images -v"""
import contextlib
import io
import json
import tempfile
import unittest
from datetime import date
from pathlib import Path

import check_images as ci

D = date.fromisoformat


def key(day: str) -> str:
    return f"{ci.S3_PREFIX}{day[:4]}/{day[5:7]}/{day.replace('-', '')}.jpg"


def row(day: str, size=1000, md5='a' * 32) -> dict:
    return {'date': day, 'key': key(day), 'bytes': size, 'width': 2000, 'height': 2800, 'md5': md5}


def obj(day_or_key: str, size=1000, md5='a' * 32) -> dict:
    return {'Key': day_or_key if day_or_key.startswith(ci.S3_PREFIX) else key(day_or_key), 'Size': size, 'ETag': f'"{md5}"'}


def run_compare(manifest_days, listing, **manifest_kw):
    """manifest_days: 날짜 목록 또는 행 목록, listing: S3 객체 목록. (종료 코드, 출력)."""
    with tempfile.TemporaryDirectory() as tmp:
        manifest, listing_file = Path(tmp, 'm.csv'), Path(tmp, 'l.json')
        rows = [r if isinstance(r, dict) else row(r, **manifest_kw) for r in manifest_days]
        ci.write_csv(manifest, ci.MANIFEST_FIELDS, rows)
        listing_file.write_text(json.dumps({'Contents': listing}), encoding='utf-8')
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            code = ci.compare(manifest, listing_file)
        return code, out.getvalue()


class KeyDate(unittest.TestCase):
    def test_reads_the_date_from_a_valid_key(self):
        self.assertEqual(ci.key_date(key('1995-05-17')), D('1995-05-17'))

    def test_anything_else_is_not_a_date(self):
        for bad in (ci.S3_PREFIX + '1995/05/readme.txt', ci.S3_PREFIX + '1995/06/19950517.jpg',  # 폴더 월이 다름
                    ci.S3_PREFIX + '1995/05/19950532.jpg',                                       # 없는 날짜
                    'timemachine-newspaper/epaper/2026/11/20261103.json', 'other/1995/05/19950517.jpg'):
            self.assertIsNone(ci.key_date(bad), bad)


class CompareKeepsExistingBehavior(unittest.TestCase):
    """이번 수정 전부터 있던 판정. 시험이 없었어서 고정해 둔다."""

    def test_all_match_is_zero_differences(self):
        code, out = run_compare(['2026-10-30', '2026-11-02'], [obj('2026-10-30'), obj('2026-11-02')])
        self.assertEqual(code, 0)
        self.assertIn('차이 0건 — 올리기 완료', out)
        self.assertIn('목록 2장 · 올라간 파일 2개', out)

    def test_a_missing_file_is_a_difference(self):
        code, out = run_compare(['2026-10-30', '2026-11-02'], [obj('2026-10-30')])
        self.assertEqual(code, 1)
        self.assertIn('올라가지 않은 파일 1건', out)
        self.assertIn(key('2026-11-02'), out)

    def test_extra_file_inside_the_manifest_range_is_a_difference(self):
        code, out = run_compare(['2026-10-30', '2026-11-02'], [obj('2026-10-30'), obj('2026-11-02'), obj('2026-10-31')])
        self.assertEqual(code, 1)
        self.assertIn('목록에 없는데 올라간 파일 1건', out)
        self.assertNotIn('자동 수집분', out)

    def test_size_and_content_differences(self):
        code, out = run_compare(['2026-10-30'], [obj('2026-10-30', size=999)])
        self.assertEqual(code, 1)
        self.assertIn('크기가 다른 파일 1건', out)
        code, out = run_compare(['2026-10-30'], [obj('2026-10-30', md5='b' * 32)])
        self.assertEqual(code, 1)
        self.assertIn('내용이 다른 파일 1건', out)

    def test_multipart_etag_is_not_compared_by_content(self):
        code, _ = run_compare(['2026-10-30'], [{'Key': key('2026-10-30'), 'Size': 1000, 'ETag': '"abc-3"'}])
        self.assertEqual(code, 0)

    def test_utf16_listing_from_windows_powershell_is_read(self):
        with tempfile.TemporaryDirectory() as tmp:
            manifest, listing = Path(tmp, 'm.csv'), Path(tmp, 'l.json')
            ci.write_csv(manifest, ci.MANIFEST_FIELDS, [row('2026-10-30')])
            listing.write_bytes(json.dumps({'Contents': [obj('2026-10-30')]}).encode('utf-16'))
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(ci.compare(manifest, listing), 0)


class CompareSeparatesAutomaticCaptures(unittest.TestCase):
    """일일 수집(2026-11-03~)이 같은 경로에 올린 사진은 보유자 목록에 없는 것이 정상이다."""

    def test_captures_after_the_manifest_end_are_reported_but_not_counted(self):
        code, out = run_compare(['2026-10-30', '2026-11-02'], [obj('2026-10-30'), obj('2026-11-02'), obj('2026-11-03'), obj('2026-11-04')])
        self.assertEqual(code, 0)
        self.assertIn('자동 수집분 2개 (2026-11-03 ~ 2026-11-04)', out)
        self.assertIn('목록의 마지막 날짜(2026-11-02) 뒤', out)
        self.assertIn('차이 0건 — 올리기 완료', out)
        self.assertIn('목록에 없는데 올라간 파일 0건', out)

    def test_a_real_difference_still_fails_even_with_captures_present(self):
        code, out = run_compare(['2026-10-30', '2026-11-02'], [obj('2026-10-30'), obj('2026-11-03')])   # 11-02 가 안 올라갔다
        self.assertEqual(code, 1)
        self.assertIn('올라가지 않은 파일 1건', out)
        self.assertIn('자동 수집분 1개', out)

    def test_a_stray_file_inside_the_range_is_not_hidden_by_the_auto_rule(self):
        code, out = run_compare(['2026-10-30', '2026-11-02'], [obj('2026-10-30'), obj('2026-11-02'), obj('2026-10-31'), obj('2026-11-03')])
        self.assertEqual(code, 1)
        self.assertIn('목록에 없는데 올라간 파일 1건', out)
        self.assertIn(key('2026-10-31'), out)

    def test_dates_before_the_capture_start_are_never_automatic(self):
        # 목록이 10-30 에서 끝나도 11-01 은 자동 수집 시작(11-03) 전이라 보유자 쪽 사진이다 → 차이.
        code, out = run_compare(['2026-10-28', '2026-10-30'], [obj('2026-10-28'), obj('2026-10-30'), obj('2026-11-01')])
        self.assertEqual(code, 1)
        self.assertIn('목록에 없는데 올라간 파일 1건', out)
        self.assertNotIn('자동 수집분', out)

    def test_the_device_clock_does_not_matter(self):
        # 보유자 기기 시계가 틀려도 결과가 같아야 한다. 그래서 '오늘 이하'는 조건에 넣지 않는다 — 날짜가 아주 먼 뒤여도 자동분이다.
        code, out = run_compare(['2026-11-02'], [obj('2026-11-02'), obj('2030-01-01')])
        self.assertEqual(code, 0)
        self.assertIn('자동 수집분 1개 (2030-01-01 ~ 2030-01-01)', out)

    def test_non_date_names_are_never_automatic(self):
        weird = [ci.S3_PREFIX + '2026/11/readme.txt', ci.S3_PREFIX + '2026/11/20261132.jpg']
        code, out = run_compare(['2026-11-02'], [obj('2026-11-02')] + [{'Key': k, 'Size': 1, 'ETag': '"x"'} for k in weird])
        self.assertEqual(code, 1)
        self.assertIn('목록에 없는데 올라간 파일 2건', out)

    def test_a_date_present_in_the_manifest_is_compared_not_skipped(self):
        # 보유자 목록이 11-03 까지 있으면 그 날은 자동 수집분이 아니라 일반 비교다(일일 수집이 올린 사진과 크기가 다르면 차이).
        code, out = run_compare(['2026-11-02', '2026-11-03'], [obj('2026-11-02'), obj('2026-11-03', size=555)])
        self.assertEqual(code, 1)
        self.assertIn('크기가 다른 파일 1건', out)

    def test_an_empty_manifest_hides_nothing(self):
        code, out = run_compare([], [obj('2026-11-03')])
        self.assertEqual(code, 1)
        self.assertIn('목록에 없는데 올라간 파일 1건', out)
        self.assertNotIn('자동 수집분', out)

    def test_old_manifest_end_before_capture_start_only_counts_from_the_start(self):
        # 목록이 2020 년에서 끝나도 2021~2026-11-02 사이 파일은 자동분이 아니다(시작일 이전).
        code, out = run_compare(['2020-12-31'], [obj('2020-12-31'), obj('2021-01-04'), obj('2026-11-03')])
        self.assertEqual(code, 1)
        self.assertIn('목록에 없는데 올라간 파일 1건', out)
        self.assertIn(key('2021-01-04'), out)
        self.assertIn('자동 수집분 1개 (2026-11-03 ~ 2026-11-03)', out)


if __name__ == '__main__':
    unittest.main()
