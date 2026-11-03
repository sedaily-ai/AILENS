"""count_day_types.py 시험 — 네트워크·AWS·실제 이미지 없이 돈다.  실행: cd timemachine-data/upload && python3 -m unittest test_count_day_types -v"""
import contextlib
import io
import json
import tempfile
import unittest
from datetime import date
from pathlib import Path

import check_images
import count_day_types as cdt

D = date.fromisoformat


def run(argv):
    out, err = io.StringIO(), io.StringIO()
    with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
        code = cdt.main(argv)
    return code, out.getvalue(), err.getvalue()


def write_manifest(path: Path, days):
    check_images.write_csv(path, check_images.MANIFEST_FIELDS,
                           [{'date': d, 'key': check_images.S3_PREFIX + f'{d[:4]}/{d[5:7]}/{d.replace("-", "")}.jpg',
                             'bytes': 1, 'width': 2000, 'height': 2800, 'md5': 'x'} for d in days])


def write_year(folder: Path, year, covers, days, nested=False):
    base = folder / 'index' / 'v1' if nested else folder
    base.mkdir(parents=True, exist_ok=True)
    content = {'schema': 1, 'year': year, 'updated_at': '2026-11-10T06:05:00+09:00', 'text_covers': covers,
               'days': {d: {'articles': [{'rank': 1, 'title': 't', 'url': 'https://n.news.naver.com/a'}]} for d in days}}
    (base / f'{year}.json').write_text(json.dumps(content, ensure_ascii=False), encoding='utf-8')


class KindTest(unittest.TestCase):
    def test_발행_중단_기간은_사진이_있어도_발행_중단이다(self):
        for day in ('1980-11-26', '1985-03-02', '1988-07-31'):
            self.assertEqual(cdt.kind_of(D(day), True, 'unknown'), 'suspended')
        # 경계 바로 밖은 발행 예상일
        self.assertEqual(cdt.kind_of(D('1980-11-25'), False, 'unknown'), 'none_unknown')
        self.assertEqual(cdt.kind_of(D('1988-08-01'), True, 'unknown'), 'photo_unknown')

    def test_일요일은_1996_09_29부터_휴간이고_그_전은_따로_센다(self):
        self.assertEqual(cdt.kind_of(D('1996-09-29'), False, 'unknown'), 'sunday')  # 일요일
        self.assertEqual(cdt.kind_of(D('1996-09-22'), False, 'unknown'), 'old_sunday')  # 그 전 일요일은 발행 예상일에 섞지 않는다
        self.assertEqual(cdt.kind_of(D('1996-09-22'), True, 'unknown'), 'old_sunday')
        self.assertEqual(cdt.kind_of(D('2024-10-13'), True, 'yes'), 'sunday')
        self.assertEqual(cdt.kind_of(D('2024-10-14'), True, 'yes'), 'both')  # 월요일
        self.assertEqual(cdt.kind_of(D('1996-09-23'), False, 'unknown'), 'none_unknown')  # 월요일
        # 발행 중단 기간의 일요일은 옛 일요일이 아니라 발행 중단이다
        self.assertEqual(cdt.kind_of(D('1985-03-03'), False, 'unknown'), 'suspended')

    def test_발행_예상일_여섯_가지(self):
        day = D('2015-01-02')
        self.assertEqual(cdt.kind_of(day, True, 'yes'), 'both')
        self.assertEqual(cdt.kind_of(day, True, 'no'), 'photo_only')
        self.assertEqual(cdt.kind_of(day, False, 'yes'), 'list_only')
        self.assertEqual(cdt.kind_of(day, False, 'no'), 'neither')
        self.assertEqual(cdt.kind_of(day, True, 'unknown'), 'photo_unknown')
        self.assertEqual(cdt.kind_of(day, False, 'unknown'), 'none_unknown')


class ListInfoTest(unittest.TestCase):
    def test_확인한_기간_안의_부재는_없음이고_밖은_미확인이다(self):
        info = cdt.ListInfo({D('2015-01-02')}, [(D('2015-01-01'), D('2015-12-31'))])
        self.assertEqual(info.state(D('2015-01-02')), 'yes')
        self.assertEqual(info.state(D('2015-01-03')), 'no')
        self.assertEqual(info.state(D('2016-01-01')), 'unknown')
        self.assertEqual(cdt.ListInfo().state(D('2015-01-02')), 'unknown')


class YearFilesTest(unittest.TestCase):
    def test_연도_파일_폴더와_index_v1_폴더_둘_다_읽는다(self):
        with tempfile.TemporaryDirectory() as tmp:
            flat, nested = Path(tmp, 'flat'), Path(tmp, 'nested')
            for folder, is_nested in ((flat, False), (nested, True)):
                write_year(folder, 2015, [['2015-01-01', '2015-12-31']], ['2015-01-02', '2015-01-05'], nested=is_nested)
                info = cdt.read_year_files(folder)
                self.assertEqual(info.days, {D('2015-01-02'), D('2015-01-05')})
                self.assertEqual(info.covers, [(D('2015-01-01'), D('2015-12-31'))])

    def test_형식이_틀린_파일은_멈춘다(self):
        with tempfile.TemporaryDirectory() as tmp:
            folder = Path(tmp)
            write_year(folder, 2015, [['2015-01-01', '2015-12-31']], [])
            (folder / '2015.json').write_text(json.dumps({'schema': 2, 'year': 2015}), encoding='utf-8')
            with self.assertRaises(cdt.InputError):
                cdt.read_year_files(folder)
            (folder / '2015.json').write_text('{', encoding='utf-8')
            with self.assertRaises(cdt.InputError):
                cdt.read_year_files(folder)
            write_year(folder, 2016, [['2016-01-01', '2016-12-31']], [])
            (folder / '2015.json').write_text(json.dumps({'schema': 1, 'year': 2014, 'text_covers': [], 'days': {}}), encoding='utf-8')
            with self.assertRaises(cdt.InputError):  # 파일 이름의 연도와 안의 year 가 다름
                cdt.read_year_files(folder)

    def test_없는_폴더는_오류(self):
        with self.assertRaises(cdt.InputError):
            cdt.read_year_files(Path('no-such-folder'))


class CountTest(unittest.TestCase):
    def setUp(self):
        # 2015-01-01(목)~2015-01-07(수): 사진은 1·2·5일, 목록은 2·3일, 확인한 기간은 1~5일
        self.photos = {D('2015-01-01'), D('2015-01-02'), D('2015-01-05')}
        self.info = cdt.ListInfo({D('2015-01-02'), D('2015-01-03')}, [(D('2015-01-01'), D('2015-01-05'))])
        self.records = cdt.build_records(self.photos, self.info, D('2015-01-01'), D('2015-01-07'))

    def test_날짜마다_종류가_하나다(self):
        kinds = {r['date'].isoformat(): r['kind'] for r in self.records}
        self.assertEqual(kinds, {
            '2015-01-01': 'photo_only', '2015-01-02': 'both', '2015-01-03': 'list_only', '2015-01-04': 'sunday',
            '2015-01-05': 'photo_only', '2015-01-06': 'none_unknown', '2015-01-07': 'none_unknown',
        })

    def test_연도_표는_합이_맞는다(self):
        (row,) = cdt.year_table(self.records, self.photos, D('2015-01-01'), D('2015-01-07'))
        self.assertEqual(row, {'year': 2015, 'days': 7, 'off': 1, 'old_sun': 0, 'old_sun_photo': 0, 'expected': 6, 'photo_yes': 3, 'photo_no': 3,
                               'both': 1, 'photo_only': 2, 'list_only': 1, 'neither': 0, 'unknown': 2, 'stray': 0})
        # 발행 예상일 = 사진 있음 + 없음 = 목록 다섯 가지의 합
        self.assertEqual(row['expected'], row['photo_yes'] + row['photo_no'])
        self.assertEqual(row['expected'], row['both'] + row['photo_only'] + row['list_only'] + row['neither'] + row['unknown'])
        self.assertEqual(row['days'], row['off'] + row['old_sun'] + row['expected'])

    def test_옛_일요일은_발행_예상일에도_발행_안_함에도_넣지_않고_사진만_센다(self):
        # 1996-09-22(일)·1996-09-15(일): 사진은 15일만 있다. 1996-09-16(월)은 사진 있음.
        photos = {D('1996-09-15'), D('1996-09-16')}
        records = cdt.build_records(photos, cdt.ListInfo(), D('1996-09-15'), D('1996-09-22'))
        (row,) = cdt.year_table(records, photos, D('1996-09-15'), D('1996-09-22'))
        self.assertEqual((row['old_sun'], row['old_sun_photo']), (2, 1))
        self.assertEqual((row['off'], row['expected'], row['photo_yes'], row['photo_no']), (0, 6, 1, 5))
        self.assertEqual(row['days'], row['off'] + row['old_sun'] + row['expected'])
        self.assertEqual(row['stray'], 0)   # 옛 일요일의 사진은 예외가 아니다

    def test_예외_사진은_발행_안_하는_날과_기간_밖을_센다(self):
        photos = {D('1985-03-02'), D('2024-10-13'), D('1960-07-31'), D('2030-01-01'), D('2024-10-14')}
        records = cdt.build_records(photos, cdt.ListInfo(), D('1960-08-01'), D('2024-12-31'))
        table = {r['year']: r for r in cdt.year_table(records, photos, D('1960-08-01'), D('2024-12-31'))}
        self.assertEqual(table[1985]['stray'], 1)   # 발행 중단 기간
        self.assertEqual(table[2024]['stray'], 1)   # 일요일
        self.assertEqual(table[1960]['stray'], 1)   # 창간 전
        self.assertEqual(table[2030]['stray'], 1)   # --until 뒤
        self.assertEqual(table[2024]['photo_yes'], 1)  # 월요일 사진은 정상

    def test_긴_구간_목록은_긴_순서로_15개만_보여_주고_전체는_파일에_둔다(self):
        with tempfile.TemporaryDirectory() as tmp:
            manifest, out = Path(tmp, 'm.csv'), Path(tmp, 'out')
            # 2010-01-01~2012-12-31 에서 매달 10~13일(4일 연속)의 사진을 뺀다. 일요일은 구간을 끊지 않으므로 3일 이상 구간이 달마다 하나다.
            # 36개월이면 3일 이상 구간이 상한(15개)을 넘는다. 창간일부터 2009년까지의 긴 공백 두 덩어리도 같이 센다.
            photos = []
            for d in cdt.daterange(D('2010-01-01'), D('2012-12-31')):
                if 10 <= d.day <= 13:
                    continue
                photos.append(d.isoformat())
            write_manifest(manifest, photos)
            code, stdout, _ = run(['--manifest', str(manifest), '--out', str(out)])
            self.assertEqual(code, 0)
            shown = [line for line in stdout.splitlines() if line.startswith('  ') and ' ~ ' in line and '일' in line]
            self.assertEqual(len(shown), cdt.SHOWN_RUNS)
            # 긴 순서. 창간~2009의 공백은 발행 중단 기간(1980-11-26~1988-07-31)에서 두 덩어리로 끊기고, 뒤쪽(6,706일)이 앞쪽(6,362일)보다 길다.
            self.assertTrue(shown[0].startswith('  1988-08-01 ~ 2009-12-31 · 6,706일'))
            self.assertTrue(shown[1].startswith('  1960-08-01 ~ 1980-11-25 · 6,362일'))
            self.assertTrue(all(int(line.rsplit('·', 1)[1].strip().rstrip('일').replace(',', '')) >= 3 for line in shown))
            self.assertIn(f'긴 순서 {cdt.SHOWN_RUNS}개만 보여 줘요', stdout)
            self.assertIn('… 나머지 ', stdout)
            rows = (out / 'missing_runs.csv').read_text(encoding='utf-8-sig').splitlines()
            self.assertGreater(len(rows) - 1, cdt.SHOWN_RUNS)   # 전체는 파일에 있다

    def test_사진이_없는_구간은_일요일을_건너뛰고_사진_날과_발행_중단에서_끊긴다(self):
        photos = {D('2024-10-12'), D('2024-10-18')}
        records = cdt.build_records(photos, cdt.ListInfo(), D('2024-10-12'), D('2024-10-18'))
        # 10-13(일)은 건너뛰고 10-14~10-17 네 날이 한 구간
        self.assertEqual(cdt.missing_runs(records), [{'start': D('2024-10-14'), 'end': D('2024-10-17'), 'days': 4}])
        # 발행 중단 기간 앞뒤의 공백은 한 구간으로 이어지지 않는다
        records = cdt.build_records(set(), cdt.ListInfo(), D('1980-11-24'), D('1988-08-02'))
        runs = cdt.missing_runs(records)
        self.assertEqual([(r['start'], r['end'], r['days']) for r in runs],
                         [(D('1980-11-24'), D('1980-11-25'), 2), (D('1988-08-01'), D('1988-08-02'), 2)])


class InputTest(unittest.TestCase):
    def test_manifest와_연도_파일로_끝까지_돈다(self):
        with tempfile.TemporaryDirectory() as tmp:
            manifest, years, out = Path(tmp, 'm.csv'), Path(tmp, 'years'), Path(tmp, 'out')
            write_manifest(manifest, ['2015-01-01', '2015-01-02'])
            write_year(years, 2015, [['2015-01-01', '2015-01-31']], ['2015-01-02'])
            code, stdout, stderr = run(['--manifest', str(manifest), '--year-files', str(years), '--out', str(out), '--until', '2015-01-04'])
            self.assertEqual((code, stderr), (0, ''))
            self.assertIn('기간 1960-08-01 ~ 2015-01-04 · 사진 2장(기간 안 2장, 밖 0장)', stdout)
            self.assertIn('네이버 1면 목록: 1일 · 확인한 기간 2015-01-01~2015-01-31', stdout)
            # 1/1(목) 사진만 · 1/2(금) 사진+목록 · 1/3(토) 둘 다 없음 · 1/4(일) 휴간
            self.assertIn('2015 | 4 | 1 | 0 | 0 | 3 | 2 | 1 | 1 | 1 | 0 | 1 | 0 | 0', stdout)
            self.assertTrue(stdout.rstrip().splitlines()[-1].startswith('결과 폴더:'))
            days = (out / 'day_types.csv').read_text(encoding='utf-8-sig').splitlines()
            self.assertEqual(days[0], 'date,weekday,kind,photo,list')
            self.assertIn('2015-01-02,금,사진+목록,1,있음', days)
            self.assertIn('2015-01-03,토,둘 다 없음,0,없음', days)
            self.assertEqual(len(days), 1 + (D('2015-01-04') - D('1960-08-01')).days + 1)
            counts = (out / 'year_counts.csv').read_text(encoding='utf-8-sig').splitlines()
            self.assertEqual(counts[0], ','.join(cdt.YEAR_FIELDS))
            self.assertTrue(counts[-1].startswith('합계,'))
            self.assertTrue((out / 'missing_runs.csv').is_file())

    def test_S3_목록은_UTF16도_읽고_이름이_아닌_키는_건너뛴다(self):
        with tempfile.TemporaryDirectory() as tmp:
            listing = Path(tmp, 'listing.json')
            data = {'Contents': [
                {'Key': 'timemachine-newspaper/img/2015/01/20150102.jpg'},
                {'Key': 'timemachine-newspaper/img/2015/01/20150103.jpg'},
                {'Key': 'timemachine-newspaper/img/2015/02/20150103.jpg'},   # 폴더 월이 다름
                {'Key': 'timemachine-newspaper/img/2015/01/20150132.jpg'},   # 없는 날짜
                {'Key': 'timemachine-newspaper/img/2015/01/readme.txt'},
                {'Key': 'timemachine-newspaper/epaper/2026/11/20261103.json'},
            ]}
            listing.write_bytes(json.dumps(data).encode('utf-16'))  # Windows PowerShell 5 의 > 가 쓰는 형식
            days, ignored = cdt.read_listing(listing)
            self.assertEqual(days, {D('2015-01-02'), D('2015-01-03')})
            self.assertEqual(ignored, 4)
            code, stdout, _ = run(['--listing', str(listing), '--until', '2015-01-03'])
            self.assertEqual(code, 0)
            self.assertIn('건너뛴 키 4개', stdout)
            self.assertIn('네이버 1면 목록: 연도 파일을 주지 않아 모두 미확인', stdout)

    def test_옛_일요일에_사진이_거의_없으면_그_시기에도_일요일자가_없던_것으로_알린다(self):
        with tempfile.TemporaryDirectory() as tmp:
            manifest = Path(tmp, 'm.csv')
            # 표는 창간일(1960-08-01)부터 센다. --until 을 1995-12-31 로 두면 옛 일요일은 1960-08-01~1995-12-31 의 일요일 전부다.
            until = '1995-12-31'
            all_days = list(cdt.daterange(D('1995-01-01'), D(until)))
            weekdays = [d.isoformat() for d in all_days if d.weekday() != 6]
            sundays_all = [d for d in cdt.daterange(D('1960-08-01'), D(until))
                           if d.weekday() == 6 and not (cdt.SUSPENDED[0] <= d <= cdt.SUSPENDED[1])]
            old_total = len(sundays_all)
            write_manifest(manifest, weekdays)
            _, stdout, _ = run(['--manifest', str(manifest), '--until', until])
            self.assertIn(f'1996-09-29 전의 일요일 {old_total:,}일 중 사진 있는 날 0일 — 사진이 없다.', stdout)
            self.assertIn('그 시기에도 일요일자가 나오지 않은 것으로 보인다', stdout)
            # 일요일 사진이 아주 적으면(10% 미만) 확인을 요청한다
            few = [d.isoformat() for d in all_days if d.weekday() == 6][:3]
            write_manifest(manifest, weekdays + few)
            _, stdout, _ = run(['--manifest', str(manifest), '--until', until])
            self.assertIn('사진 있는 날 3일 — 사진이 아주 적다.', stdout)
            # 절반 가까이 있으면 일요일자가 있는 것으로 본다
            many = [d.isoformat() for d in cdt.daterange(D('1960-08-01'), D(until))
                    if d.weekday() == 6 and not (cdt.SUSPENDED[0] <= d <= cdt.SUSPENDED[1])][:old_total // 2]
            write_manifest(manifest, weekdays + many)
            _, stdout, _ = run(['--manifest', str(manifest), '--until', until])
            self.assertIn(f'사진 있는 날 {len(many):,}일 — 일요일자 사진이 있다.', stdout)

    def test_check_images가_만든_manifest를_그대로_읽는다(self):
        with tempfile.TemporaryDirectory() as tmp:
            manifest = Path(tmp, 'newspaper_manifest.csv')
            check_images.write_csv(manifest, check_images.MANIFEST_FIELDS,
                                   [{'date': '1995-05-17', 'key': 'k', 'bytes': 1, 'width': 2, 'height': 3, 'md5': 'm'}])
            self.assertEqual(cdt.read_manifest(manifest), {D('1995-05-17')})

    def test_잘못된_입력은_오류_메시지와_종료_코드_1(self):
        with tempfile.TemporaryDirectory() as tmp:
            bad = Path(tmp, 'bad.csv')
            bad.write_text('name\nx\n', encoding='utf-8')
            code, _, err = run(['--manifest', str(bad)])
            self.assertEqual(code, 1)
            self.assertIn('date 열이 없음', err)
            bad.write_text('date\n2015-13-40\n', encoding='utf-8')
            self.assertIn('날짜 형식', run(['--manifest', str(bad)])[2])
            empty = Path(tmp, 'empty.csv')
            check_images.write_csv(empty, check_images.MANIFEST_FIELDS, [])
            self.assertIn('--until', run(['--manifest', str(empty)])[2])   # 사진도 목록도 없으면 기간을 정할 수 없음
            code, _, err = run(['--manifest', str(empty), '--until', '1959-01-01'])
            self.assertEqual(code, 1)
            self.assertIn('창간일', err)
            self.assertIn('형식', run(['--manifest', str(empty), '--until', 'abc'])[2])
            self.assertEqual(run(['--manifest', str(Path(tmp, 'nope.csv'))])[0], 1)  # 파일이 없음


if __name__ == '__main__':
    unittest.main()
