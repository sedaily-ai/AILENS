"""내 생일 타임머신 '그때 100만 원어치 샀다면' 시세 수집 — 출생 연도별 정적 JSON 과 최신값 JSON 을 만든다.

결과: service/frontend/public/data/birthday-assets/{YYYY}.json, latest.json
- 웹은 생일을 넣으면 그 해(1964-05-04 이전 출생자는 스무 살 생일의 해) 파일 하나만 받아 기기에서 계산한다.
  서버에는 출생 연도만 드러나고 생일 날짜는 가지 않는다.
- 이용 근거가 확인된 출처만 수집한다(SOURCES 의 allowed). 근거는 docs/product/birthday-assets/출처_이용조건.md.
  허용된 출처가 하나도 없으면 파일을 쓰지 않는다.
- 일별 계열은 연도 파일마다 전년 마지막 TAIL_DAYS 거래일을 함께 넣는다(1월 1일·연초 휴장일 생일의 직전 거래일).

실행: cd service/backend && AWS_DEFAULT_REGION=us-east-1 python3 scripts/build_birthday_assets.py \\
        [--until YYYY-MM-DD] [--pink-sheet <세계은행 CMO-Historical-Data-Monthly.xlsx 경로 또는 URL>]
ECOS 인증키는 SSM(/sedaily-mbti/ecos-api-key)에서만 읽고 출력하지 않는다.
"""
import argparse
import io
import json
import os
import re
import sys
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Callable, Dict, List, Optional, Sequence, Tuple

import requests

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from common.dates.validation import KST  # noqa: E402
from common.secrets import get_secret  # noqa: E402

ECOS_KEY_PARAM = '/sedaily-mbti/ecos-api-key'
ECOS_URL = 'https://ecos.bok.or.kr/api/StatisticSearch/{key}/json/kr/{first}/{last}/{table}/{cycle}/{start}/{end}/{items}'
ECOS_PAGE = 100000  # 2026-10-20 실측: 원/달러 일별 17,529건이 한 번에 내려왔다.
ECOS_TIMEOUT_SECONDS = 60
OUT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'frontend', 'public', 'data', 'birthday-assets'))
FIRST_YEAR = 1964  # 원/달러 기록 시작(1964-05-04)
TAIL_DAYS = 10

Point = Tuple[str, float]


@dataclass(frozen=True)
class Source:
    label: str                      # 화면 출처 표기
    allowed: bool                   # 출처_이용조건.md 판정이 '가능'일 때만 True
    requires: Tuple[str, ...] = ()  # 계산에 함께 쓰는 다른 출처(금의 원화 환산 → 환율)


# 판정이 바뀌면 여기와 출처_이용조건.md 를 함께 고친다(2026-10-20: 모두 확인 전).
SOURCES: Dict[str, Source] = {
    'usdkrw': Source('한국은행 ECOS 원/미국달러 매매기준율', False),
    'kospi': Source('한국은행 ECOS 코스피(한국거래소)', False),
    'apartment': Source('한국은행 ECOS KB 주택매매가격지수 아파트(서울)', False),
    'gold': Source('세계은행 Pink Sheet 금 월평균', False, requires=('usdkrw',)),
}

# ECOS 계열: (통계표, 주기, 시작, 끝(None 이면 --until), 항목 코드 경로). 2026-10-20 ECOS 로 확인한 값.
ECOS_SERIES = {
    'usdkrw_daily': ('731Y001', 'D', '19640504', None, '0000001'),
    'usdkrw_monthly': ('731Y004', 'M', '196405', None, '0000001/0000100'),  # 0000100 = 평균자료
    'kospi_daily': ('802Y001', 'D', '19950103', None, '0001000'),
    'kospi_annual': ('901Y014', 'A', '1976', '1994', '1080000'),  # 월별 값은 없다. 1994년 이전은 연평균.
    'apartment': ('901Y062', 'M', '198601', None, 'P63ACA'),
}
SERIES_OF = {
    'usdkrw': ('usdkrw_daily', 'usdkrw_monthly'),
    'kospi': ('kospi_daily', 'kospi_annual'),
    'apartment': ('apartment',),
}


class EcosError(RuntimeError):
    """ECOS 가 오류 코드를 돌려줬다(인증키 문제 등). 메시지에 키를 담지 않는다."""


def allowed_items(sources: Optional[Dict[str, Source]] = None) -> List[str]:
    """허용된 출처 중 함께 쓰는 출처까지 허용된 것만."""
    sources = SOURCES if sources is None else sources
    return [name for name, source in sources.items()
            if source.allowed and all(sources[need].allowed for need in source.requires)]


def _period(raw: str, cycle: str) -> str:
    if cycle == 'D':
        return f'{raw[:4]}-{raw[4:6]}-{raw[6:8]}'
    if cycle == 'M':
        return f'{raw[:4]}-{raw[4:6]}'
    return raw[:4]


def fetch_ecos(table: str, cycle: str, start: str, end: str, items: str, key: str,
               get: Callable = requests.get) -> List[Point]:
    """ECOS StatisticSearch 한 계열. 자료가 없으면 []. 다른 오류는 EcosError."""
    points: List[Point] = []
    first = 1
    while True:
        url = ECOS_URL.format(key=key, first=first, last=first + ECOS_PAGE - 1, table=table, cycle=cycle,
                              start=start, end=end, items=items)
        body = get(url, timeout=ECOS_TIMEOUT_SECONDS).json()
        found = body.get('StatisticSearch')
        if not found:
            result = body.get('RESULT') or {}
            if result.get('CODE') == 'INFO-200':  # 해당하는 데이터가 없음
                return points
            raise EcosError(f"ECOS {table} 오류: {result.get('CODE')} {result.get('MESSAGE')}")
        rows = found.get('row') or []
        for row in rows:
            value = row.get('DATA_VALUE')
            if value not in (None, ''):
                points.append((_period(str(row['TIME']), cycle), float(value)))
        total = int(found.get('list_total_count') or 0)
        first += len(rows)
        if not rows or first > total:
            return sorted(points)


_PINK_MONTH = re.compile(r'^(\d{4})M(\d{2})$')


def parse_pink_sheet_gold(data: bytes) -> List[Point]:
    """세계은행 CMO Historical Data Monthly 엑셀의 'Monthly Prices' 시트에서 금(달러/트로이온스) 월평균.
    열 위치는 매달 바뀔 수 있어 열 제목이 'Gold' 인 열을 찾는다. 행은 '1960M01' 형식."""
    from openpyxl import load_workbook

    sheet = load_workbook(io.BytesIO(data), read_only=True, data_only=True)['Monthly Prices']
    rows = list(sheet.iter_rows(values_only=True))
    column = None
    for row in rows:
        for index, cell in enumerate(row):
            if isinstance(cell, str) and cell.strip() == 'Gold':
                column = index
                break
        if column is not None:
            break
    if column is None:
        raise ValueError("'Monthly Prices' 시트에서 'Gold' 열을 찾지 못했다")
    points = []
    for row in rows:
        match = _PINK_MONTH.match(str(row[0]).strip()) if row and row[0] is not None else None
        if match and column < len(row) and isinstance(row[column], (int, float)):
            points.append((f'{match.group(1)}-{match.group(2)}', float(row[column])))
    return sorted(points)


def read_source(path_or_url: str, get: Callable = requests.get) -> bytes:
    if re.match(r'^https?://', path_or_url):
        res = get(path_or_url, timeout=ECOS_TIMEOUT_SECONDS)
        res.raise_for_status()
        return res.content
    with open(path_or_url, 'rb') as fp:
        return fp.read()


def _daily_slice(points: Sequence[Point], year: int) -> List[Point]:
    start = f'{year}-01-01'
    before = [p for p in points if p[0] < start][-TAIL_DAYS:]
    return before + [p for p in points if p[0].startswith(f'{year}-')]


def _year_slice(points: Sequence[Point], year: int) -> List[Point]:
    return [p for p in points if p[0].startswith(f'{year}-')]


def build_year_files(series: Dict[str, List[Point]], items: Sequence[str], first_year: int, last_year: int) -> Dict[int, dict]:
    """연도 → 파일 내용. 허용된 항목의 키만 넣는다."""
    files = {}
    annual = dict(series.get('kospi_annual', []))
    for year in range(first_year, last_year + 1):
        data: dict = {'year': year}
        if 'usdkrw' in items:
            data['usdkrw'] = {'daily': _daily_slice(series['usdkrw_daily'], year),
                              'monthly': _year_slice(series['usdkrw_monthly'], year)}
        if 'kospi' in items:
            daily = _daily_slice(series['kospi_daily'], year) if year >= 1995 else []
            data['kospi'] = {'daily': daily, 'annual': annual.get(str(year)) if year < 1995 else None}
        if 'apartment' in items:
            data['apartment'] = _year_slice(series['apartment'], year)
        if 'gold' in items:
            data['gold'] = _year_slice(series['gold'], year)
        files[year] = data
    return files


def build_latest(series: Dict[str, List[Point]], items: Sequence[str], generated_at: str,
                 sources: Optional[Dict[str, Source]] = None) -> dict:
    sources = SOURCES if sources is None else sources
    last = lambda name: list(series[name][-1]) if series.get(name) else None  # noqa: E731
    latest: dict = {'generatedAt': generated_at, 'sources': {name: sources[name].label for name in items}}
    if 'usdkrw' in items:
        latest['usdkrw'] = {'daily': last('usdkrw_daily'), 'monthly': last('usdkrw_monthly')}
    if 'kospi' in items:
        latest['kospi'] = last('kospi_daily')
    if 'apartment' in items:
        latest['apartment'] = last('apartment')
    if 'gold' in items:
        latest['gold'] = last('gold')
    return latest


def collect(items: Sequence[str], until: str, key: Optional[str], pink_sheet: Optional[str],
            get: Callable = requests.get) -> Dict[str, List[Point]]:
    """허용된 항목에 필요한 계열만 받는다."""
    series: Dict[str, List[Point]] = {}
    for item in items:
        for name in SERIES_OF.get(item, ()):
            table, cycle, start, end, codes = ECOS_SERIES[name]
            if end is None:
                end = until.replace('-', '') if cycle == 'D' else until[:7].replace('-', '')
            series[name] = fetch_ecos(table, cycle, start, end, codes, key, get=get)
    if 'gold' in items:
        if not pink_sheet:
            raise SystemExit('금을 수집하려면 --pink-sheet 로 세계은행 월별 엑셀 경로나 URL 을 넘겨야 한다')
        series['gold'] = [p for p in parse_pink_sheet_gold(read_source(pink_sheet, get=get)) if p[0] <= until[:7]]
    return series


def write_files(out_dir: str, files: Dict[int, dict], latest: dict) -> None:
    os.makedirs(out_dir, exist_ok=True)
    for year, data in files.items():
        with open(os.path.join(out_dir, f'{year}.json'), 'w', encoding='utf-8') as fp:
            json.dump(data, fp, ensure_ascii=False, separators=(',', ':'))
    with open(os.path.join(out_dir, 'latest.json'), 'w', encoding='utf-8') as fp:
        json.dump(latest, fp, ensure_ascii=False, indent=1)
        fp.write('\n')


def main(argv=None, get: Callable = requests.get, secret: Callable[[str], str] = get_secret) -> int:
    now = datetime.now(KST)
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('--until', default=(now - timedelta(days=1)).strftime('%Y-%m-%d'))
    parser.add_argument('--out', default=OUT_DIR)
    parser.add_argument('--pink-sheet', default=None)
    args = parser.parse_args(argv)

    items = allowed_items()
    if not items:
        print('이용 근거가 확인된 출처가 없어 아무 파일도 쓰지 않았다(SOURCES 의 allowed, 출처_이용조건.md).')
        return 0
    needs_ecos = any(item in SERIES_OF for item in items)
    key = secret(ECOS_KEY_PARAM) if needs_ecos else None
    series = collect(items, args.until, key, args.pink_sheet, get=get)
    files = build_year_files(series, items, FIRST_YEAR, int(args.until[:4]))
    write_files(args.out, files, build_latest(series, items, now.isoformat(timespec='seconds')))
    summary = ', '.join(f'{name} {len(points)}건({points[0][0]}~{points[-1][0]})' if points else f'{name} 0건'
                        for name, points in series.items())
    print(f'items={",".join(items)} years={FIRST_YEAR}~{args.until[:4]} {summary} -> {args.out}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
