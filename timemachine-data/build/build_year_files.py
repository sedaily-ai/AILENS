#!/usr/bin/env python3
"""1면 기사 CSV 로 연도 파일(index/v1/YYYY.json)을 만든다. 화면이 날짜를 고르면 그 연도 파일 하나만 받아 쓴다.

사용:
  python3 build/build_year_files.py --csv naver_front_2026.csv --covers 2026-01-01:2026-11-03 --out year-files
  (--csv 와 --covers 는 여러 번 쓸 수 있다. 결과는 <out>/index/v1/YYYY.json — S3 timemachine-newspaper/index/v1/ 에 그대로 올린다.)

입력 CSV 는 헤더에 date, rank, title, url 이 있으면 된다(crawl_naver_front.py 의 CSV 는 그대로 쓸 수 있고 나머지 열은 무시한다).
--covers 는 그 기간의 모든 날짜를 확인했다는 선언이다. 확인한 기간에 행이 없는 날은 "1면 기사가 없는 날"로 보고,
확인하지 않은 기간은 화면이 기존 방식(빅카인즈)으로 채운다. 선언한 기간 밖의 행이 있으면 오류다.
같은 입력이면 같은 파일이 나온다(updated_at 만 다르면 파일을 다시 쓰지 않는다). 표준 라이브러리만 쓴다.
형식 설명: timemachine-data/README.md "데이터 구조".
"""
from __future__ import annotations

import argparse
import csv
import json
import os
import sys
from collections import defaultdict
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

SCHEMA = 1
KST = timezone(timedelta(hours=9))
REQUIRED = ('date', 'rank', 'title', 'url')
EXPECTED_ARTICLES = (3, 6)  # 요구사항 HTML: 네이버 1면 기사는 3~6건


class BuildError(Exception):
    pass


def parse_covers(values: List[str]) -> List[Tuple[date, date]]:
    """'YYYY-MM-DD:YYYY-MM-DD' 목록 → 겹치거나 이어진 구간을 합친 목록."""
    spans: List[Tuple[date, date]] = []
    for value in values:
        try:
            start_text, end_text = value.split(':')
            start, end = date.fromisoformat(start_text), date.fromisoformat(end_text)
        except ValueError:
            raise BuildError(f'--covers 형식이 맞지 않아요: {value} (예: 2011-07-09:2025-12-31)') from None
        if start > end:
            raise BuildError(f'--covers 시작이 끝보다 늦어요: {value}')
        spans.append((start, end))
    spans.sort()
    merged: List[Tuple[date, date]] = []
    for start, end in spans:
        if merged and start <= merged[-1][1] + timedelta(days=1):
            merged[-1] = (merged[-1][0], max(merged[-1][1], end))
        else:
            merged.append((start, end))
    return merged


def read_rows(paths: List[Path]) -> Dict[str, List[Dict[str, Any]]]:
    """CSV 들을 날짜별 기사 목록으로 읽는다. 같은 (날짜, 순서)가 두 번 나오면 오류."""
    by_date: Dict[str, Dict[int, Dict[str, Any]]] = defaultdict(dict)
    for path in paths:
        with path.open(encoding='utf-8-sig', newline='') as f:
            reader = csv.DictReader(f)
            missing = [name for name in REQUIRED if name not in (reader.fieldnames or [])]
            if missing:
                raise BuildError(f'{path.name}: 필요한 열이 없어요: {", ".join(missing)}')
            for line, row in enumerate(reader, start=2):
                where = f'{path.name} {line}행'
                try:
                    day = date.fromisoformat(row['date'].strip()).isoformat()
                    rank = int(row['rank'])
                except ValueError:
                    raise BuildError(f'{where}: 날짜나 순서를 읽지 못했어요') from None
                title, url = row['title'].strip(), row['url'].strip()
                if rank < 1 or not title or not url.startswith('https://'):
                    raise BuildError(f'{where}: 순서·제목·주소 중 비었거나 맞지 않는 값이 있어요')
                if rank in by_date[day]:
                    raise BuildError(f'{where}: {day} 순서 {rank} 가 중복돼요')
                by_date[day][rank] = {'rank': rank, 'title': title, 'url': url}
    return {day: [items[r] for r in sorted(items)] for day, items in by_date.items()}


def covered(day: date, spans: List[Tuple[date, date]]) -> bool:
    return any(start <= day <= end for start, end in spans)


def build(by_date: Dict[str, List[Dict[str, Any]]], spans: List[Tuple[date, date]],
          updated_at: str) -> Tuple[Dict[int, Dict[str, Any]], List[str]]:
    """연도별 파일 내용과 경고 목록. 선언한 기간 밖의 행이 있으면 BuildError."""
    outside = sorted(day for day in by_date if not covered(date.fromisoformat(day), spans))
    if outside:
        raise BuildError(f'--covers 로 선언한 기간 밖의 날짜가 있어요: {outside[0]} 등 {len(outside)}일')
    warnings: List[str] = []
    years: Dict[int, Dict[str, Any]] = {}
    for start, end in spans:
        for year in range(start.year, end.year + 1):
            lo, hi = max(start, date(year, 1, 1)), min(end, date(year, 12, 31))
            years.setdefault(year, {'schema': SCHEMA, 'year': year, 'updated_at': updated_at, 'text_covers': [], 'days': {}})
            years[year]['text_covers'].append([lo.isoformat(), hi.isoformat()])
    for day in sorted(by_date):
        articles = by_date[day]
        ranks = [a['rank'] for a in articles]
        if ranks != list(range(1, len(ranks) + 1)):
            warnings.append(f'{day}: 순서가 1부터 이어지지 않아요 {ranks}')
        if not EXPECTED_ARTICLES[0] <= len(articles) <= EXPECTED_ARTICLES[1]:
            warnings.append(f'{day}: 기사 {len(articles)}건 (보통 {EXPECTED_ARTICLES[0]}~{EXPECTED_ARTICLES[1]}건)')
        years[int(day[:4])]['days'][day] = {'articles': articles}
    return years, warnings


def dump(content: Dict[str, Any]) -> bytes:
    return (json.dumps(content, ensure_ascii=False, separators=(',', ':')) + '\n').encode('utf-8')


def write_year_files(years: Dict[int, Dict[str, Any]], out: Path) -> Dict[int, str]:
    """'written' | 'unchanged'(updated_at 말고는 같아서 그대로 둠)."""
    folder = out / 'index' / 'v1'
    folder.mkdir(parents=True, exist_ok=True)
    result: Dict[int, str] = {}
    for year, content in sorted(years.items()):
        path = folder / f'{year}.json'
        if path.exists():
            try:
                old = json.loads(path.read_text(encoding='utf-8'))
                if {k: v for k, v in old.items() if k != 'updated_at'} == {k: v for k, v in content.items() if k != 'updated_at'}:
                    result[year] = 'unchanged'
                    continue
            except ValueError:
                pass
        tmp = path.with_suffix('.json.part')
        tmp.write_bytes(dump(content))
        os.replace(tmp, path)
        result[year] = 'written'
    return result


def summary(years: Dict[int, Dict[str, Any]], states: Dict[int, str], out: Path) -> None:
    print('연도 | 확인한 날 | 기사 있는 날 | 기사 없는 날 | 기사 수(최소~최대) | 파일 크기 | 상태')
    for year, content in sorted(years.items()):
        checked = sum((date.fromisoformat(b) - date.fromisoformat(a)).days + 1 for a, b in content['text_covers'])
        counts = [len(d['articles']) for d in content['days'].values()]
        size = (out / 'index' / 'v1' / f'{year}.json').stat().st_size
        spread = f'{min(counts)}~{max(counts)}' if counts else '-'
        print(f'{year} | {checked:,} | {len(counts):,} | {checked - len(counts):,} | {spread} | {size:,}바이트 | {states[year]}')


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description='1면 기사 CSV 로 연도 파일 만들기')
    parser.add_argument('--csv', type=Path, action='append', required=True, help='기사 CSV(여러 번 가능)')
    parser.add_argument('--covers', action='append', required=True, help='모든 날짜를 확인한 기간 YYYY-MM-DD:YYYY-MM-DD(여러 번 가능)')
    parser.add_argument('--out', type=Path, required=True, help='결과 폴더(<out>/index/v1/YYYY.json)')
    args = parser.parse_args(argv)
    try:
        spans = parse_covers(args.covers)
        by_date = read_rows(args.csv)
        updated_at = datetime.now(KST).isoformat(timespec='seconds')
        years, warnings = build(by_date, spans, updated_at)
        states = write_year_files(years, args.out)
    except BuildError as e:
        print(f'실패: {e}', file=sys.stderr)
        return 1
    summary(years, states, args.out)
    for line in warnings[:20]:
        print(f'  [확인] {line}')
    if len(warnings) > 20:
        print(f'  … 나머지 {len(warnings) - 20}건')
    return 0


if __name__ == '__main__':
    sys.exit(main())
