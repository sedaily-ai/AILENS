#!/usr/bin/env python3
"""타임머신 날짜 종류별 개수표 — 날짜마다 1면 사진과 네이버 1면 목록이 있는지 세어 연도별 표를 만든다. 파일은 읽기만 한다.

사용:
  python3 upload/count_day_types.py --manifest newspaper_manifest.csv [--year-files <폴더>] [--out <결과폴더>] [--until YYYY-MM-DD]
  python3 upload/count_day_types.py --listing listing.json           [--year-files <폴더>] [--out <결과폴더>] [--until YYYY-MM-DD]
  - 사진(둘 중 하나): --manifest = check_images.py 의 올리기 전 점검 목록(newspaper_manifest.csv),
    --listing = 올린 뒤 aws s3api list-objects-v2 --bucket sedaily-lens-timemachine-newspaper --prefix timemachine-newspaper/img/ --output json 결과.
  - 네이버 1면 목록(선택): --year-files = build_year_files.py 가 만든 index/v1/YYYY.json 이 든 폴더(그 위 폴더도 가능).
    주지 않거나 그 해 파일이 없으면 목록 열은 '미확인'이다(그 날은 화면이 빅카인즈로 채운다).
  - 세는 기간은 창간일(1960-08-01)부터 --until 까지다. --until 을 주지 않으면 사진·목록 중 가장 늦은 날짜까지다.
  - --out 을 주면 day_types.csv(날짜별 종류), year_counts.csv(연도별 표), missing_runs.csv(사진이 이어서 없는 구간)를 쓴다.

날짜 종류(창간일부터 --until 까지 날짜마다 하나):
  발행 중단          1980-11-26~1988-07-31(서울경제 지면 공백)
  일요일 휴간        1996-09-29부터의 일요일
  옛 일요일          1996-09-29 전의 일요일. 일요일자가 나오던 시기라고 알려져 있지만(백엔드 time_machine.py) 사진이 있는지는 실제 목록으로만 알 수
                     있어 발행 예상일에 섞지 않고 따로 센다. '옛 일요일 사진' 열이 거의 0이면 그 시기에도 일요일자가 없었던 것이다.
  발행 예상일        나머지 모든 날. 사진과 목록이 있는지에 따라
                     사진+목록 · 사진만(목록 확인했는데 없음) · 목록만(사진 없음) · 둘 다 없음 · 목록 미확인(사진 있음/없음)
  예외 사진          발행 중단·일요일 휴간에 있는 사진, 창간일 전이나 --until 뒤 날짜의 사진(개수만 센다)
명절·휴간으로 쉰 날과 자료 누락은 구분할 수 없어 둘 다 '사진 없음'으로 센다. 며칠짜리 짧은 구간은 명절로 보이고, 긴 구간은 보관 공백이다.

표준 라이브러리만 쓴다(Windows·macOS 공통). 규격: timemachine-data/261103_타임머신_1면이미지_인수규격.md, 표시 규칙: 261103_타임머신_신문장면_표시규칙.md
"""
from __future__ import annotations

import argparse
import csv
import json
import sys
from collections import Counter
from datetime import date, timedelta
from pathlib import Path
from typing import Dict, Iterable, List, Optional, Set, Tuple

# 같은 규칙을 두 번 쓰지 않는다 — 창간일·지면 공백·일요일자 폐지일·사진 이름 형식·UTF-16 JSON 읽기는 올리기 전 점검과 같은 값이다.
from check_images import FOUNDED, NAME, S3_PREFIX, SUNDAY_CLOSED_FROM, SUSPENDED, read_json, write_csv

SUNDAY = 6
WEEKDAYS = '월화수목금토일'
SCHEMA = 1
SHORT_RUN = 2  # 이 일수 이하로 사진이 빠진 구간은 명절·결측으로 보고 개수만 알린다.
SHOWN_RUNS = 15  # 화면에는 긴 구간 이만큼만 보여 준다(전체는 missing_runs.csv).

OFF = ('suspended', 'sunday')
LABEL = {
    'suspended': '발행 중단',
    'sunday': '일요일 휴간',
    'old_sunday': '일요일(휴간 규칙 전)',
    'both': '사진+목록',
    'photo_only': '사진만(목록 없음)',
    'list_only': '목록만(사진 없음)',
    'neither': '둘 다 없음',
    'photo_unknown': '사진 있음(목록 미확인)',
    'none_unknown': '사진 없음(목록 미확인)',
}
LIST_LABEL = {'yes': '있음', 'no': '없음', 'unknown': '미확인'}
YEAR_FIELDS = ['year', 'days', 'off', 'old_sun', 'old_sun_photo', 'expected', 'photo_yes', 'photo_no', 'both', 'photo_only', 'list_only', 'neither', 'unknown', 'stray']
YEAR_HEADER = ['연도', '달력일', '발행 안 함', '옛 일요일', '옛 일요일 사진', '발행 예상일', '사진 있음', '사진 없음', '사진+목록', '사진만', '목록만', '둘 다 없음', '목록 미확인', '예외 사진']


class InputError(Exception):
    pass


# ---------- 읽기 ----------

def read_manifest(path: Path) -> Set[date]:
    """check_images.py 의 newspaper_manifest.csv 에서 날짜 집합. 같은 날짜가 여럿이어도 한 번만 센다."""
    days: Set[date] = set()
    with path.open(encoding='utf-8-sig', newline='') as f:
        reader = csv.DictReader(f)
        if 'date' not in (reader.fieldnames or []):
            raise InputError(f'{path.name}: date 열이 없음(check_images.py 가 만든 newspaper_manifest.csv 가 아님)')
        for line, row in enumerate(reader, start=2):
            try:
                days.add(date.fromisoformat(row['date'].strip()))
            except ValueError:
                raise InputError(f'{path.name} {line}행: 날짜 형식이 맞지 않아요: {row["date"]!r}') from None
    return days


def read_listing(path: Path) -> Tuple[Set[date], int]:
    """aws s3api list-objects-v2 결과에서 사진 날짜 집합과 사진 이름이 아니라서 건너뛴 키 수."""
    data = read_json(path) or {}
    days: Set[date] = set()
    ignored = 0
    for obj in data.get('Contents', []):
        key = obj.get('Key', '')
        m = NAME.match(key[len(S3_PREFIX):]) if key.startswith(S3_PREFIX) else None
        try:
            if not m or m.group(1) != m.group(3) or m.group(2) != m.group(4):
                raise ValueError
            days.add(date(int(m.group(3)), int(m.group(4)), int(m.group(5))))
        except ValueError:
            ignored += 1
    return days, ignored


class ListInfo:
    """네이버 1면 목록이 있는 날(yes)과 확인한 기간(covers). 확인한 기간에 없으면 no, 확인하지 않았으면 unknown."""

    def __init__(self, days: Optional[Set[date]] = None, covers: Optional[List[Tuple[date, date]]] = None):
        self.days = days or set()
        self.covers = covers or []

    def state(self, day: date) -> str:
        if day in self.days:
            return 'yes'
        return 'no' if any(a <= day <= b for a, b in self.covers) else 'unknown'


def _year_file(folder: Path, year_name: str) -> Optional[Path]:
    for candidate in (folder / year_name, folder / 'index' / 'v1' / year_name):
        if candidate.is_file():
            return candidate
    return None


def read_year_files(folder: Path) -> ListInfo:
    """index/v1/YYYY.json(build_year_files.py 산출물, schema 1) 전부를 읽는다. 형식이 틀린 파일이 있으면 멈춘다."""
    if not folder.is_dir():
        raise InputError(f'폴더가 아님: {folder}')
    names = sorted({p.name for base in (folder, folder / 'index' / 'v1') if base.is_dir() for p in base.glob('????.json')})
    info = ListInfo()
    for name in names:
        path = _year_file(folder, name)
        assert path is not None
        try:
            raw = json.loads(path.read_text(encoding='utf-8-sig'))
            year = int(name[:4])
            if not isinstance(raw, dict) or raw.get('schema') != SCHEMA or raw.get('year') != year:
                raise ValueError('schema 1 이 아니거나 year 가 파일 이름과 다름')
            for start, end in raw['text_covers']:
                info.covers.append((date.fromisoformat(start), date.fromisoformat(end)))
            for text in raw['days']:
                info.days.add(date.fromisoformat(text))
        except (ValueError, KeyError, TypeError) as e:
            raise InputError(f'{path}: 연도 파일을 읽지 못함 ({e})') from None
    return info


# ---------- 세기 ----------

def kind_of(day: date, photo: bool, list_state: str) -> str:
    if SUSPENDED[0] <= day <= SUSPENDED[1]:
        return 'suspended'
    if day.weekday() == SUNDAY:
        # 1996-09-29부터는 규칙상 휴간이다. 그 전 일요일은 일요일자가 나오던 시기라고 알려져 있지만(백엔드 time_machine.py) 사진이 있는지는
        # 실제 목록으로만 알 수 있어서 발행 예상일에 섞지 않고 따로 센다.
        return 'sunday' if day >= SUNDAY_CLOSED_FROM else 'old_sunday'
    if list_state == 'unknown':
        return 'photo_unknown' if photo else 'none_unknown'
    if photo:
        return 'both' if list_state == 'yes' else 'photo_only'
    return 'list_only' if list_state == 'yes' else 'neither'


def daterange(start: date, end: date) -> Iterable[date]:
    for offset in range((end - start).days + 1):
        yield start + timedelta(days=offset)


def build_records(photos: Set[date], info: ListInfo, start: date, until: date) -> List[dict]:
    records = []
    for day in daterange(start, until):
        photo, state = day in photos, info.state(day)
        records.append({'date': day, 'kind': kind_of(day, photo, state), 'photo': photo, 'list': state})
    return records


def year_table(records: List[dict], photos: Set[date], start: date, until: date) -> List[Dict[str, int]]:
    """연도별 개수. 달력일 = 발행 안 함 + 옛 일요일 + 발행 예상일, 발행 예상일 = 사진 있음 + 사진 없음 = 목록 종류 다섯 개의 합."""
    rows: Dict[int, Counter] = {}
    for r in records:
        c = rows.setdefault(r['date'].year, Counter())
        c['days'] += 1
        if r['kind'] == 'old_sunday':
            c['old_sun'] += 1
            c['old_sun_photo'] += r['photo']
            continue
        if r['kind'] in OFF:
            c['off'] += 1
            c['stray'] += r['photo']
            continue
        c['expected'] += 1
        c['photo_yes' if r['photo'] else 'photo_no'] += 1
        k = r['kind']
        c['unknown' if k.endswith('_unknown') else k] += 1
    for day in photos:
        if day < start or day > until:
            rows.setdefault(day.year, Counter())['stray'] += 1
    return [dict(year=year, **{f: rows[year][f] for f in YEAR_FIELDS[1:]}) for year in sorted(rows)]


def missing_runs(records: List[dict]) -> List[dict]:
    """사진이 없는 발행 예상일이 이어진 구간. 일요일(옛 일요일 포함)은 건너뛰어 이어지고, 사진이 있는 날과 발행 중단 기간에서 끊긴다."""
    runs: List[dict] = []
    current: Optional[dict] = None
    for r in records:
        if r['kind'] == 'suspended':
            current = None
            continue
        if r['kind'] in ('sunday', 'old_sunday'):
            continue
        if r['photo']:
            current = None
        elif current:
            current['end'], current['days'] = r['date'], current['days'] + 1
        else:
            current = {'start': r['date'], 'end': r['date'], 'days': 1}
            runs.append(current)
    return runs


# ---------- 출력 ----------

def total_row(table: List[Dict[str, int]]) -> Dict[str, int]:
    return dict(year='합계', **{f: sum(row[f] for row in table) for f in YEAR_FIELDS[1:]})


def print_report(table, runs, photos, info, start, until, ignored):
    inside = sum(1 for d in photos if start <= d <= until)
    print(f'기간 {start} ~ {until} · 사진 {len(photos):,}장(기간 안 {inside:,}장, 밖 {len(photos) - inside:,}장)'
          + (f' · 건너뛴 키 {ignored:,}개' if ignored else ''))
    if info.covers:
        spans = ', '.join(f'{a}~{b}' for a, b in sorted(set(info.covers)))
        print(f'네이버 1면 목록: {len(info.days):,}일 · 확인한 기간 {spans}')
    else:
        print('네이버 1면 목록: 연도 파일을 주지 않아 모두 미확인')
    print(' | '.join(YEAR_HEADER))
    for row in table + [total_row(table)]:
        cells = [str(row['year'])] + [f'{row[f]:,}' for f in YEAR_FIELDS[1:]]
        print(' | '.join(cells))
    old_total = sum(row['old_sun'] for row in table)
    old_photo = sum(row['old_sun_photo'] for row in table)
    if old_total:
        if old_photo == 0:
            verdict = '사진이 없다. 그 시기에도 일요일자가 나오지 않은 것으로 보인다(화면의 일요일 대체 규칙을 확인해야 한다).'
        elif old_photo * 10 < old_total:
            verdict = '사진이 아주 적다. 일요일자가 없던 시기로 보이고, 있는 사진이 맞는 것인지 확인해야 한다.'
        else:
            verdict = '일요일자 사진이 있다.'
        print(f'1996-09-29 전의 일요일 {old_total:,}일 중 사진 있는 날 {old_photo:,}일 — {verdict}')
    long_runs = sorted((r for r in runs if r['days'] > SHORT_RUN), key=lambda r: (-r['days'], r['start']))
    print(f'사진이 {SHORT_RUN + 1}일 이상 이어서 없는 구간 {len(long_runs):,}개 (발행 예상일 기준)'
          + (f' — 긴 순서 {SHOWN_RUNS}개만 보여 줘요' if len(long_runs) > SHOWN_RUNS else ''))
    for r in long_runs[:SHOWN_RUNS]:
        print(f'  {r["start"]} ~ {r["end"]} · {r["days"]:,}일')
    if len(long_runs) > SHOWN_RUNS:
        print(f'  … 나머지 {len(long_runs) - SHOWN_RUNS:,}개는 --out 의 missing_runs.csv')
    short = [r for r in runs if r['days'] <= SHORT_RUN]
    print(f'{SHORT_RUN}일 이하로 빠진 구간 {len(short):,}개 · 합계 {sum(r["days"] for r in short):,}일 (명절·결측으로 보임)')


def write_outputs(out: Path, records, table, runs):
    out.mkdir(parents=True, exist_ok=True)
    write_csv(out / 'day_types.csv', ['date', 'weekday', 'kind', 'photo', 'list'],
              [{'date': r['date'].isoformat(), 'weekday': WEEKDAYS[r['date'].weekday()], 'kind': LABEL[r['kind']],
                'photo': int(r['photo']), 'list': LIST_LABEL[r['list']]} for r in records])
    write_csv(out / 'year_counts.csv', YEAR_FIELDS, table + [total_row(table)])
    write_csv(out / 'missing_runs.csv', ['start', 'end', 'days'],
              [{'start': r['start'].isoformat(), 'end': r['end'].isoformat(), 'days': r['days']} for r in runs])
    print(f'결과 폴더: {out}')


def main(argv: Optional[List[str]] = None) -> int:
    parser = argparse.ArgumentParser(description='타임머신 날짜 종류별 개수표')
    source = parser.add_mutually_exclusive_group(required=True)
    source.add_argument('--manifest', type=Path, help='올리기 전 점검 목록(newspaper_manifest.csv)')
    source.add_argument('--listing', type=Path, help='올린 뒤 S3 목록(list-objects-v2 JSON)')
    parser.add_argument('--year-files', type=Path, help='네이버 1면 목록 연도 파일(index/v1/YYYY.json) 폴더')
    parser.add_argument('--until', help='세는 마지막 날짜 YYYY-MM-DD(기본: 사진·목록 중 가장 늦은 날짜)')
    parser.add_argument('--out', type=Path, help='CSV 를 쓸 폴더')
    args = parser.parse_args(argv)
    try:
        ignored = 0
        if args.manifest:
            photos = read_manifest(args.manifest)
        else:
            photos, ignored = read_listing(args.listing)
        info = read_year_files(args.year_files) if args.year_files else ListInfo()
        latest = max(photos | info.days, default=None)
        try:
            until = date.fromisoformat(args.until) if args.until else latest
        except ValueError:
            raise InputError(f'--until 형식이 맞지 않아요: {args.until} (예: 2026-11-02)') from None
        if until is None:
            raise InputError('사진도 목록도 없어서 세는 기간을 정할 수 없어요. --until 을 주세요')
        if until < FOUNDED:
            raise InputError(f'--until 이 창간일({FOUNDED})보다 앞서요')
    except (InputError, OSError) as e:
        print(f'오류: {e}', file=sys.stderr)
        return 1
    records = build_records(photos, info, FOUNDED, until)
    table = year_table(records, photos, FOUNDED, until)
    runs = missing_runs(records)
    print_report(table, runs, photos, info, FOUNDED, until, ignored)
    if args.out:
        write_outputs(args.out, records, table, runs)
    return 0


if __name__ == '__main__':
    sys.exit(main())
