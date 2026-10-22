"""내 생일 타임머신 '그때 1억 원' 장면의 생활 물가 품목 배수 자료 — KOSIS 품목별 소비자물가지수(서울)로 정적 JSON 하나를 만든다.

결과: service/frontend/src/features/news-feed/components/birthday/data/birthdayItemPrices.json
- 출처는 국가데이터처 소비자물가지수 품목별(서울), KOSIS — orgId=101, tblId=DT_1J22001, objL1=T11(서울), itmId=T, prdSe=M.
  이용 근거는 KOSIS 통계정보 활용약관 제8조(상업적 활용)·제7조(출처 표시). docs/product/birthday-assets/출처_이용조건.md.
- 품목은 조사 보고서 판정 그대로 다섯 개(ITEMS), 배수만 쓴다. 이발·미용·목욕·택시·영화·커피·담배·삼겹살은 넣지 않는다.
- 1억 원 장면과 같은 기간 기준: 그때는 태어난 해 연평균(12달이 모두 있는 해만, 월값 단순평균)이고, 1억 원 장면이 월값을
  쓰는 달(MONTHS, birthdayCatalog.ts 의 CPI_MONTHLY 키)은 그달 값이다. 지금은 --now 달(1억 원 장면 CPI_LATEST.period 와 같은 달).
  두 달이 같은지는 프런트 테스트(lib/birthdayItemPrices.test.ts)가 확인한다.
- 웹은 이 파일을 번들에 넣어 기기에서 계산한다(새 요청 없음, 서버에는 생일이 가지 않는다).

실행: cd service/backend && AWS_DEFAULT_REGION=us-east-1 uv run --no-project --with boto3==1.35.0 \\
        --with requests==2.32.3 python scripts/build_birthday_item_prices.py --now 2026-09
KOSIS 인증키는 SSM(/sedaily-mbti/kosis-api-key)에서만 읽고 출력·기록하지 않는다.
"""
import argparse
import json
import os
import re
import sys
from dataclasses import dataclass
from typing import Callable, Dict, List, Sequence, Tuple

import requests

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from common.secrets import get_secret  # noqa: E402

KOSIS_KEY_PARAM = '/sedaily-mbti/kosis-api-key'
KOSIS_URL = 'https://kosis.kr/openapi/Param/statisticsParameterData.do'
KOSIS_TIMEOUT_SECONDS = 60
# 지출목적별 소비자물가지수(품목포함, 2020=100) 서울. objL2(품목)만 품목마다 바꾼다.
KOSIS_TABLE = {'orgId': '101', 'tblId': 'DT_1J22001', 'itmId': 'T', 'objL1': 'T11', 'prdSe': 'M'}
FIRST_MONTH = '197501'  # 품목 지수 시작(2026-10-22 조사 보고서)
_KOSIS_ERR = re.compile(r'^\d{1,3}$')  # KOSIS err 형식(10, 20, 30 등)
_MONTH = re.compile(r'^\d{4}-(0[1-9]|1[0-2])$')
OUT_PATH = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', 'frontend', 'src', 'features', 'news-feed',
                                        'components', 'birthday', 'data', 'birthdayItemPrices.json'))
SOURCE = '국가데이터처 소비자물가지수 품목별(서울), KOSIS'

Point = Tuple[str, float]


@dataclass(frozen=True)
class Item:
    id: str
    name: str   # 화면 표기
    code: str   # KOSIS objL2


# 2026-10-22 조사 보고서 판정 그대로(배수 ○). 순서는 화면 순서이고 배수로 정렬하지 않는다.
ITEMS: Tuple[Item, ...] = (
    Item('jajangmyeon', '짜장면', 'K01119'),      # 1975-01~
    Item('naengmyeon', '냉면', 'K01114'),         # 1975-01~
    Item('bus', '시내버스', 'G03201'),            # 1975-01~
    Item('subway', '지하철', 'G03102'),           # 1980-01~
    Item('kimchi_stew', '김치찌개백반', 'K01101'),  # 1985-01~
)
# 1억 원 장면이 연평균 대신 그달 값을 쓰는 달 — birthdayCatalog.ts CPI_MONTHLY 의 키와 같게 둔다.
MONTHS: Tuple[str, ...] = ('1988-02',)


class KosisError(RuntimeError):
    """KOSIS 요청이 실패했거나 오류 코드를 돌려줬다. 메시지에 키를 담지 않는다."""


def fetch_kosis(code: str, start: str, end: str, key: str, get: Callable = requests.get) -> List[Point]:
    """품목 하나의 서울 월별 지수. 자료가 없으면(err 30) []. 다른 오류는 KosisError(키 든 URL 은 메시지·트레이스백에 남기지 않는다)."""
    params = {**KOSIS_TABLE, 'method': 'getList', 'apiKey': key, 'objL2': code, 'format': 'json', 'jsonVD': 'Y',
              'startPrdDe': start, 'endPrdDe': end}
    try:
        body = get(KOSIS_URL, params=params, timeout=KOSIS_TIMEOUT_SECONDS).json()
    except (requests.RequestException, ValueError) as error:
        raise KosisError(f'KOSIS {code} 요청 실패: {type(error).__name__}') from None
    if isinstance(body, dict):
        err = body.get('err')
        if err == '30':  # 데이터가 존재하지 않습니다
            return []
        # errMsg 는 넣지 않는다. err 도 KOSIS 형식(숫자)일 때만 쓴다.
        shown = err if isinstance(err, str) and _KOSIS_ERR.match(err) else '알 수 없는 코드'
        raise KosisError(f'KOSIS {code} 오류: {shown}')
    if not isinstance(body, list):
        raise KosisError(f'KOSIS {code} 응답 형식이 다르다')
    points: List[Point] = []
    for row in body:
        if row.get('C1') != KOSIS_TABLE['objL1'] or row.get('C2') != code or row.get('ITM_ID') != KOSIS_TABLE['itmId']:
            raise KosisError(f'KOSIS {code} 응답에 다른 계열이 섞였다')
        value = row.get('DT')
        if value in (None, '', '-'):
            continue
        period = str(row.get('PRD_DE', ''))
        points.append((f'{period[:4]}-{period[4:6]}', float(value)))
    return sorted(points)


def _next_month(period: str) -> str:
    year, month = int(period[:4]), int(period[5:7])
    year, month = (year + 1, 1) if month == 12 else (year, month + 1)
    return f'{year:04d}-{month:02d}'


def annual_means(points: Sequence[Point]) -> Dict[str, float]:
    """연평균 — 12달이 모두 있는 해만(월값 단순평균, 소수 넷째 자리). 빠진 달이 있으면 ValueError."""
    for (previous, _), (period, _) in zip(points, points[1:]):
        if period != _next_month(previous):
            raise ValueError(f'품목 지수가 연속이 아니다: {previous} 다음이 {period}')
    by_year: Dict[str, List[float]] = {}
    for period, value in points:
        by_year.setdefault(period[:4], []).append(value)
    return {year: round(sum(values) / 12, 4) for year, values in by_year.items() if len(values) == 12}


def build(series: Dict[str, List[Point]], now: str, months: Sequence[str] = MONTHS) -> dict:
    """파일 내용. series 는 품목 id → 월별 지수. 지금 달 값이 없는 품목이 있으면 ValueError."""
    items = []
    for item in ITEMS:
        points = series[item.id]
        by_period = dict(points)
        if now not in by_period:
            raise ValueError(f'{item.name}({item.code}) {now} 값이 없다')
        items.append({'id': item.id, 'name': item.name, 'code': item.code, 'from': points[0][0], 'latest': by_period[now],
                      'annual': annual_means(points), 'monthly': {m: by_period[m] for m in months if m in by_period}})
    return {'source': SOURCE, 'table': KOSIS_TABLE['tblId'], 'region': '서울', 'now': now, 'items': items}


def write_file(path: str, data: dict) -> int:
    """파일을 쓰고 크기(바이트)를 돌려준다."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'w', encoding='utf-8') as fp:
        json.dump(data, fp, ensure_ascii=False, indent=1)
        fp.write('\n')
    return os.path.getsize(path)


def main(argv=None, get: Callable = requests.get, secret: Callable[[str], str] = get_secret) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument('--now', required=True, help="'지금' 달 YYYY-MM — 1억 원 장면 CPI_LATEST.period 와 같은 달")
    parser.add_argument('--out', default=OUT_PATH)
    args = parser.parse_args(argv)
    if not _MONTH.match(args.now):
        parser.error('--now 는 YYYY-MM 형식이다')

    key = secret(KOSIS_KEY_PARAM)
    end = args.now.replace('-', '')
    series = {item.id: fetch_kosis(item.code, FIRST_MONTH, end, key, get=get) for item in ITEMS}
    empty = [item.code for item in ITEMS if not series[item.id]]
    if empty:
        raise KosisError(f'KOSIS 자료가 없는 품목: {", ".join(empty)}')
    data = build(series, args.now)
    size = write_file(args.out, data)
    summary = ', '.join(f'{item.code} {len(series[item.id])}건({series[item.id][0][0]}~{series[item.id][-1][0]})' for item in ITEMS)
    print(f'now={args.now} {summary} size={size / 1024:.1f}KB -> {args.out}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
