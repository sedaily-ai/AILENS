#!/usr/bin/env python3
"""타임머신 1면 원본 이미지 — 올리기 전 점검과 올린 뒤 대조. 파일은 읽기만 하고 바꾸지 않는다.

점검: python3 upload/check_images.py <지면1면 폴더> [--out 결과폴더]
  - 폴더 아래 YYYY/MM/YYYYMMDD.jpg 를 모두 읽어 이름·날짜·JPEG 형식·크기·중복을 확인한다.
  - 결과: newspaper_manifest.csv(올릴 파일 목록), newspaper_problems.csv(오류·확인 목록).
    결과폴더 기본값은 이미지 폴더 옆 '<폴더이름>_newspaper_check'(저장소·이미지 폴더 밖).
  - 오류가 하나라도 있으면 종료 코드 1. 확인은 올려도 되지만 목록을 보고 알려 준다.
대조: python3 upload/check_images.py --compare <newspaper_manifest.csv> <listing.json>
  - listing.json = aws s3api list-objects-v2 --bucket sedaily-lens-timemachine-newspaper --prefix timemachine-newspaper/img/ --output json 결과.
  - 빠진 파일·남는 파일·크기 다름·내용 다름(한 번에 올린 파일은 ETag가 MD5)을 센다. 차이가 있으면 종료 코드 1.
표준 라이브러리만 쓴다(Windows·macOS 공통). 규격: timemachine-data/261103_타임머신_1면이미지_인수규격.md
"""
import argparse
import csv
import hashlib
import json
import re
import struct
import sys
from datetime import date, datetime, timedelta, timezone
from pathlib import Path

FOUNDED = date(1960, 8, 1)
# 서울경제 지면 공백 기간 — 프론트 birthdayFrontPage.ts FRONT_PAGE_RULES.suspended 와 같은 값.
SUSPENDED = (date(1980, 11, 26), date(1988, 7, 31))
# 이날부터 일요일자 신문이 없다 — 백엔드 time_machine.py SUNDAY_CLOSED_FROM 과 같은 값.
SUNDAY_CLOSED_FROM = date(1996, 9, 29)
S3_PREFIX = 'timemachine-newspaper/img/'
NAME = re.compile(r'^(\d{4})/(\d{2})/(\d{4})(\d{2})(\d{2})\.jpg$')
JPEG_SUFFIXES = ('.jpg', '.jpeg')
SKIPPED_NAMES = {'.DS_Store', 'Thumbs.db', 'desktop.ini'}
MIN_WIDTH = 1000
KST = timezone(timedelta(hours=9))
# 크기가 들어 있는 SOF 마커(C4·C8·CC 는 SOF 가 아니다).
SOF_MARKERS = {0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF}
ERROR, CHECK = '오류', '확인'
MANIFEST_FIELDS = ['date', 'key', 'bytes', 'width', 'height', 'md5']


def jpeg_size(data: bytes):
    """JPEG 의 (가로, 세로). JPEG 가 아니거나 크기를 못 찾으면 None."""
    if data[:2] != b'\xff\xd8':
        return None
    i = 2
    while i + 9 <= len(data):
        if data[i] != 0xFF:
            return None
        marker = data[i + 1]
        if marker == 0xFF:  # 채움 바이트
            i += 1
            continue
        if marker == 0x01 or 0xD0 <= marker <= 0xD7:  # 길이 없는 마커
            i += 2
            continue
        length = struct.unpack('>H', data[i + 2:i + 4])[0]
        if marker in SOF_MARKERS:
            height, width = struct.unpack('>HH', data[i + 5:i + 9])
            return width, height
        i += 2 + length
    return None


def check_file(rel: str, data: bytes, today: date):
    """한 파일의 (날짜, 크기, 문제 목록). 문제는 (수준, 이유)."""
    m = NAME.match(rel)
    if not m:
        return None, None, [(ERROR, '이름·폴더가 YYYY/MM/YYYYMMDD.jpg 형식이 아님(확장자는 소문자 .jpg)')]
    folder_y, folder_m, y, mo, d = m.groups()
    if (folder_y, folder_m) != (y, mo):
        return None, None, [(ERROR, f'폴더({folder_y}/{folder_m})와 파일 이름의 연·월이 다름')]
    try:
        day = date(int(y), int(mo), int(d))
    except ValueError:
        return None, None, [(ERROR, '없는 날짜')]
    problems = []
    if day < FOUNDED:
        problems.append((ERROR, '창간일(1960-08-01)보다 앞선 날짜'))
    if day > today:
        problems.append((ERROR, '오늘보다 뒤 날짜'))
    if not data:
        return day, None, problems + [(ERROR, '빈 파일(0바이트)')]
    size = jpeg_size(data)
    if size is None:
        return day, None, problems + [(ERROR, 'JPEG 로 읽히지 않음')]
    if b'\xff\xd9' not in data[-4096:]:
        problems.append((ERROR, '파일 끝 표시가 없음(복사 중 잘렸을 수 있음)'))
    width, height = size
    if SUSPENDED[0] <= day <= SUSPENDED[1]:
        problems.append((CHECK, '지면 공백 기간(1980-11-26~1988-07-31) 날짜'))
    if day >= SUNDAY_CLOSED_FROM and day.weekday() == 6:
        problems.append((CHECK, '일요일(1996-09-29부터 일요일은 휴간)'))
    if width < MIN_WIDTH:
        problems.append((CHECK, f'가로 {width}px 로 작음'))
    if height <= width:
        problems.append((CHECK, f'가로({width})가 세로({height})보다 크거나 같음'))
    return day, size, problems


def scan(root: Path, today: date):
    """폴더 전체를 점검해 (매니페스트 행, 문제 행, 건너뛴 파일 수)."""
    rows, problems, skipped = [], [], 0
    by_md5 = {}
    for path in sorted(p for p in root.rglob('*') if p.is_file()):
        rel = path.relative_to(root).as_posix()
        if path.name in SKIPPED_NAMES or path.name.startswith('._'):
            skipped += 1
            continue
        if path.suffix.lower() not in JPEG_SUFFIXES:
            problems.append((CHECK, rel, 'JPEG 가 아니라 올리지 않음'))
            continue
        data = path.read_bytes()
        day, size, found = check_file(rel, data, today)
        md5 = hashlib.md5(data).hexdigest()
        if day and size and md5 in by_md5:
            found.append((ERROR, f'{by_md5[md5]} 파일과 내용이 똑같음'))
        problems.extend((level, rel, reason) for level, reason in found)
        if day and size and not any(level == ERROR for level, _ in found):
            by_md5[md5] = rel
            rows.append({'date': day.isoformat(), 'key': S3_PREFIX + rel, 'bytes': len(data),
                         'width': size[0], 'height': size[1], 'md5': md5})
    return rows, problems, skipped


def write_csv(path: Path, fields, rows):
    """rows 는 dict(매니페스트) 또는 tuple(문제 목록). 엑셀에서 한글이 깨지지 않게 BOM 을 붙인다."""
    with path.open('w', newline='', encoding='utf-8-sig') as f:
        writer = csv.writer(f)
        writer.writerow(fields)
        writer.writerows([row[k] for k in fields] if isinstance(row, dict) else row for row in rows)


def summary(rows, problems, skipped):
    errors = sum(1 for p in problems if p[0] == ERROR)
    checks = len(problems) - errors
    print(f'올릴 JPEG {len(rows):,}장 · 오류 {errors:,}건 · 확인 {checks:,}건 · 건너뛴 숨김 파일 {skipped:,}개')
    if rows:
        total = sum(r['bytes'] for r in rows)
        widths = [r['width'] for r in rows]
        print(f'총 {total:,}바이트({total / 1e9:.1f}GB) · 평균 {total / len(rows) / 1e6:.2f}MB · '
              f'가장 큰 파일 {max(r["bytes"] for r in rows) / 1e6:.1f}MB')
        print(f'기간 {rows[0]["date"]} ~ {rows[-1]["date"]} · 가로 {min(widths):,}~{max(widths):,}px')
        years = {}
        for r in rows:
            years[r['date'][:4]] = years.get(r['date'][:4], 0) + 1
        print('연도별 장 수: ' + ', '.join(f'{y} {n}' for y, n in sorted(years.items())))
    for level, rel, reason in problems[:20]:
        print(f'  [{level}] {rel} — {reason}')
    if len(problems) > 20:
        print(f'  … 나머지 {len(problems) - 20}건은 newspaper_problems.csv')
    print('오류 0건이면 올려도 됩니다.' if not errors else '오류를 고친 뒤 다시 점검해 주세요. 올리지 마세요.')
    return errors


def read_json(path: Path):
    """aws CLI 출력. Windows PowerShell 5 의 > 는 UTF-16 으로 쓰므로 둘 다 읽는다."""
    raw = path.read_bytes()
    for encoding in ('utf-8-sig', 'utf-16'):
        try:
            return json.loads(raw.decode(encoding))
        except (UnicodeDecodeError, json.JSONDecodeError):
            continue
    raise SystemExit(f'JSON 으로 읽지 못함: {path}')


def compare(manifest_path: Path, listing_path: Path) -> int:
    with manifest_path.open(encoding='utf-8-sig') as f:
        expected = {row['key']: row for row in csv.DictReader(f)}
    actual = {obj['Key']: obj for obj in (read_json(listing_path) or {}).get('Contents', [])}
    both = expected.keys() & actual.keys()
    diffs = {
        '올라가지 않은 파일': sorted(expected.keys() - actual.keys()),
        '목록에 없는데 올라간 파일': sorted(actual.keys() - expected.keys()),
        '크기가 다른 파일': sorted(k for k in both if int(expected[k]['bytes']) != int(actual[k]['Size'])),
        '내용이 다른 파일': sorted(k for k in both if '-' not in actual[k]['ETag']
                            and actual[k]['ETag'].strip('"') != expected[k]['md5']),
    }
    print(f'목록 {len(expected):,}장 · 올라간 파일 {len(actual):,}개')
    for label, keys in diffs.items():
        print(f'{label} {len(keys):,}건')
        for key in keys[:10]:
            print(f'  {key}')
    failed = sum(len(keys) for keys in diffs.values())
    print('차이 0건 — 올리기 완료' if not failed else '차이가 있어요. 같은 sync 명령을 다시 실행한 뒤 다시 대조해 주세요.')
    return 1 if failed else 0


def main():
    parser = argparse.ArgumentParser(description='타임머신 1면 원본 이미지 점검·대조')
    parser.add_argument('paths', nargs='+', help='점검: <지면1면 폴더> / 대조: <manifest.csv> <listing.json>')
    parser.add_argument('--out', help='점검 결과를 쓸 폴더')
    parser.add_argument('--compare', action='store_true', help='올린 뒤 S3 목록과 대조')
    args = parser.parse_args()
    if args.compare:
        if len(args.paths) != 2:
            parser.error('--compare 에는 manifest.csv 와 listing.json 두 개가 필요합니다')
        sys.exit(compare(Path(args.paths[0]), Path(args.paths[1])))
    root = Path(args.paths[0]).resolve()
    if not root.is_dir():
        parser.error(f'폴더가 아님: {root}')
    out = Path(args.out).resolve() if args.out else root.parent / f'{root.name}_newspaper_check'
    out.mkdir(parents=True, exist_ok=True)
    rows, problems, skipped = scan(root, datetime.now(KST).date())
    write_csv(out / 'newspaper_manifest.csv', MANIFEST_FIELDS, rows)
    write_csv(out / 'newspaper_problems.csv', ['level', 'path', 'reason'], problems)
    errors = summary(rows, problems, skipped)
    print(f'결과 폴더: {out}')
    sys.exit(1 if errors else 0)


if __name__ == '__main__':
    main()
