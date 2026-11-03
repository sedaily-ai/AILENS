"""build_year_files 단위 시험 — 네트워크·AWS 없이 돈다.
실행: cd timemachine-data/build && python3 -m unittest test_build_year_files -v
"""
import contextlib
import csv
import io
import json
import tempfile
import unittest
from datetime import date
from pathlib import Path

import build_year_files as by

HEADER = ['date', 'page', 'rank', 'is_top', 'article_id', 'title', 'url', 'thumbnail']


def write_csv(path, rows):
    with path.open('w', newline='', encoding='utf-8-sig') as f:
        writer = csv.writer(f)
        writer.writerow(HEADER)
        for day, rank, title in rows:
            writer.writerow([day, 1, rank, 0, '0001', title, f'https://n.news.naver.com/article/newspaper/011/{day}-{rank}', ''])


def run(csv_rows, covers, out):
    folder = Path(out)
    path = folder / 'in.csv'
    write_csv(path, csv_rows)
    return by.main(['--csv', str(path), *sum((['--covers', c] for c in covers), []), '--out', str(folder / 'out')])


class Covers(unittest.TestCase):
    def test_overlapping_and_adjacent_spans_are_merged(self):
        spans = by.parse_covers(['2011-07-09:2011-12-31', '2012-01-01:2012-06-30', '2012-06-01:2012-07-10', '2020-01-01:2020-01-31'])
        self.assertEqual(spans, [(date(2011, 7, 9), date(2012, 7, 10)), (date(2020, 1, 1), date(2020, 1, 31))])

    def test_bad_spans_are_rejected(self):
        for bad in ('2011-07-09', '2011-07-09:2011-13-01', '2012-01-02:2012-01-01'):
            with self.subTest(bad=bad), self.assertRaises(by.BuildError):
                by.parse_covers([bad])


class Build(unittest.TestCase):
    def test_year_files_hold_covers_and_only_days_with_articles(self):
        with tempfile.TemporaryDirectory() as tmp:
            rows = [('2014-05-17', 1, '첫째'), ('2014-05-17', 2, '둘째'), ('2014-05-17', 3, '셋째'), ('2015-01-02', 1, '새해')]
            with contextlib.redirect_stdout(io.StringIO()):
                self.assertEqual(run(rows, ['2014-01-01:2015-12-31'], tmp), 0)
            y2014 = json.loads((Path(tmp) / 'out/index/v1/2014.json').read_text(encoding='utf-8'))
            self.assertEqual((y2014['schema'], y2014['year'], y2014['text_covers']), (1, 2014, [['2014-01-01', '2014-12-31']]))
            self.assertEqual(list(y2014['days']), ['2014-05-17'])
            self.assertEqual([a['rank'] for a in y2014['days']['2014-05-17']['articles']], [1, 2, 3])
            self.assertEqual(y2014['days']['2014-05-17']['articles'][0], {'rank': 1, 'title': '첫째', 'url': 'https://n.news.naver.com/article/newspaper/011/2014-05-17-1'})
            y2015 = json.loads((Path(tmp) / 'out/index/v1/2015.json').read_text(encoding='utf-8'))
            self.assertEqual(y2015['text_covers'], [['2015-01-01', '2015-12-31']])

    def test_cover_across_years_is_clipped_per_year(self):
        spans = by.parse_covers(['2011-07-09:2012-03-31'])
        years, _ = by.build({}, spans, 'T')
        self.assertEqual(years[2011]['text_covers'], [['2011-07-09', '2011-12-31']])
        self.assertEqual(years[2012]['text_covers'], [['2012-01-01', '2012-03-31']])

    def test_rows_outside_declared_covers_are_rejected(self):
        with tempfile.TemporaryDirectory() as tmp, contextlib.redirect_stderr(io.StringIO()) as err:
            self.assertEqual(run([('2014-05-17', 1, '기사')], ['2015-01-01:2015-12-31'], tmp), 1)
            self.assertIn('밖의 날짜', err.getvalue())

    def test_rank_gaps_and_odd_counts_are_reported_as_warnings(self):
        by_date = {'2014-05-17': [{'rank': 1, 't': 1}, {'rank': 3, 't': 3}]}
        years, warnings = by.build(by_date, by.parse_covers(['2014-05-01:2014-05-31']), 'T')
        self.assertEqual(len(warnings), 2)
        self.assertTrue(any('이어지지 않아요' in w for w in warnings))
        self.assertTrue(any('기사 2건' in w for w in warnings))
        self.assertIn('2014-05-17', years[2014]['days'])

    def test_duplicate_rank_and_bad_values_are_rejected(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / 'dup.csv'
            write_csv(path, [('2014-05-17', 1, 'a'), ('2014-05-17', 1, 'b')])
            with self.assertRaisesRegex(by.BuildError, '중복'):
                by.read_rows([path])
            write_csv(path, [('2014-05-17', 0, 'a')])
            with self.assertRaises(by.BuildError):
                by.read_rows([path])
            write_csv(path, [('2014-13-17', 1, 'a')])
            with self.assertRaises(by.BuildError):
                by.read_rows([path])
            path.write_text('date,rank,title\n2014-05-17,1,a\n', encoding='utf-8')
            with self.assertRaisesRegex(by.BuildError, '필요한 열'):
                by.read_rows([path])

    def test_rerun_with_same_input_leaves_files_untouched(self):
        with tempfile.TemporaryDirectory() as tmp:
            rows = [('2014-05-17', 1, '기사'), ('2014-05-17', 2, '기사2'), ('2014-05-17', 3, '기사3')]
            with contextlib.redirect_stdout(io.StringIO()):
                run(rows, ['2014-01-01:2014-12-31'], tmp)
                target = Path(tmp) / 'out/index/v1/2014.json'
                first = target.read_bytes()
                out = io.StringIO()
                with contextlib.redirect_stdout(out):
                    run(rows, ['2014-01-01:2014-12-31'], tmp)
            self.assertEqual(target.read_bytes(), first)
            self.assertIn('unchanged', out.getvalue())

    def test_changed_input_rewrites_the_file(self):
        with tempfile.TemporaryDirectory() as tmp, contextlib.redirect_stdout(io.StringIO()):
            run([('2014-05-17', 1, '가')], ['2014-01-01:2014-12-31'], tmp)
            run([('2014-05-17', 1, '나')], ['2014-01-01:2014-12-31'], tmp)
            data = json.loads((Path(tmp) / 'out/index/v1/2014.json').read_text(encoding='utf-8'))
            self.assertEqual(data['days']['2014-05-17']['articles'][0]['title'], '나')

    def test_output_is_compact_utf8_without_ascii_escapes(self):
        years, _ = by.build({'2014-05-17': [{'rank': 1, 'title': '한글 제목', 'url': 'https://x'}]}, by.parse_covers(['2014-05-01:2014-05-31']), 'T')
        text = by.dump(years[2014]).decode('utf-8')
        self.assertIn('한글 제목', text)
        self.assertNotIn(': ', text)
        self.assertTrue(text.endswith('\n'))

    def test_two_csv_files_are_merged(self):
        with tempfile.TemporaryDirectory() as tmp:
            a, b = Path(tmp) / 'a.csv', Path(tmp) / 'b.csv'
            write_csv(a, [('2014-05-17', 1, 'a')])
            write_csv(b, [('2015-01-02', 1, 'b')])
            self.assertEqual(sorted(by.read_rows([a, b])), ['2014-05-17', '2015-01-02'])


if __name__ == '__main__':
    unittest.main()
