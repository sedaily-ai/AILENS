"""
"그날 이걸 샀다면" 카드용 — 실제 조사한 자산가격 시계열.

모든 수치는 출처가 있는 실측치이며 수기 어림값은 사용하지 않는다.

- 코스피: 1995~2025 연말 종가(다토리인디고 정리표) + 2026-08-14 종가(나무위키
  '코스피/역사/2026년'). 1990~1994 연말 종가는 신뢰할 자료를 못 찾아 뺐다 —
  그 구간 날짜는 코스피 카드 자체를 안 보여준다(추정치로 채우지 않음).
- 비트코인: 나무위키 '비트코인/역사' 연도별 표 + 2023~2025 연말가·2026-08-16
  현재가(각각 뉴스 검색으로 확인). 2010년은 그해 기록된 최저값(12월 $0.3)을 쓴다.
- 로또 6/45: 1회차 2002-12-07(토) 추첨 시작, 1등 확률 1/8,145,060(동행복권
  공식 통계), 역대 평균 1등 당첨금 2,014,003,760원. 2004-08-07(88회차)부터
  장당 가격이 2,000원→1,000원으로 바뀜.
- 스타벅스 아메리카노(톨): 1999~2025 가격표(뉴스 기사 정리본, 프론트동 등
  교차 확인).

로또는 확률형이므로 수익률 프레임을 사용하지 않는다. 당첨 확률과 평균
당첨금을 사실 그대로 제시하고, 같은 금액을 코스피에 투자한 경우와 대조하는
카드로 구성한다(build_investment_scenarios 참조).
"""
from datetime import datetime
from typing import Any, Dict, List, Optional

DATE_FORMAT = '%Y-%m-%d'

# ─── 코스피 ──────────────────────────────────────────────────────────────
KOSPI_YEAR_END = {
    1995: 883, 1996: 651, 1997: 376, 1998: 562, 1999: 1028, 2000: 505,
    2001: 694, 2002: 628, 2003: 811, 2004: 896, 2005: 1379, 2006: 1434,
    2007: 1897, 2008: 1124, 2009: 1683, 2010: 2051, 2011: 1826, 2012: 1997,
    2013: 2011, 2014: 1916, 2015: 1961, 2016: 2026, 2017: 2467, 2018: 2041,
    2019: 2198, 2020: 2873, 2021: 2978, 2022: 2236, 2023: 2655, 2024: 2399,
    2025: 4214,
}
KOSPI_CURRENT = 6977.94
KOSPI_CURRENT_LABEL = '2026-08-14 종가'
KOSPI_MIN_YEAR = min(KOSPI_YEAR_END)

# 역사적으로 뚜렷한 연도는 일반 문구 대신 이 문구를 사용한다.
KOSPI_YEAR_STORY = {
    1997: 'IMF 외환위기로 코스피가 반토막 났던 그해.',
    1999: 'IMF 위기 저점을 지나 코스피가 1,000선을 회복한 그해.',
    2000: '닷컴 버블이 터지며 코스피가 500선까지 밀린 그해.',
    2008: '리먼 사태로 전 세계 증시가 폭락한 그해.',
    2020: '코로나19로 코스피가 급락했다가 급반등한 그해.',
    2021: '코스피가 3,000선을 처음 넘어선 역대 최고점 부근이던 그해.',
}

# ─── 비트코인 ────────────────────────────────────────────────────────────
BTC_YEAR_END_USD = {
    2010: 0.3, 2011: 4.7, 2012: 13.5, 2013: 805.9, 2014: 318.2,
    2015: 430.0, 2016: 963.4, 2017: 13850.4, 2018: 3709.4, 2019: 7196.4,
    2020: 28949.4, 2021: 46219.5, 2022: 16537.4, 2023: 42000.0,
    2024: 93425.0, 2025: 87508.83,
}
BTC_CURRENT_USD = 63004.0
BTC_CURRENT_LABEL = '2026-08-16 시세'
BTC_MIN_YEAR = min(BTC_YEAR_END_USD)

BTC_YEAR_STORY = {
    2017: '비트코인이 처음으로 1만 달러를 넘기며 광풍이 불었던 그해.',
    2018: '전년도 급등 후 크립토 겨울이 시작된 그해.',
    2021: '비트코인이 사상 최고가(4월 약 5.7만 달러)를 찍었던 그해.',
    2022: '테라·FTX 사태로 크립토 시장이 무너졌던 그해.',
    2024: '비트코인이 처음으로 10만 달러를 돌파했던 그해.',
}

# ─── 로또 6/45 ───────────────────────────────────────────────────────────
LOTTO_START_DATE = '2002-12-07'
LOTTO_PRICE_CHANGE_DATE = '2004-08-07'  # 88회차부터 장당 2,000원→1,000원
LOTTO_ODDS_DENOM = 8_145_060
LOTTO_AVG_JACKPOT = 2_014_003_760
LOTTO_MAX_JACKPOT = 40_722_960_000  # 역대 최고 1등 당첨금(2003년 19회차)

# ─── 스타벅스 아메리카노(톨) ───────────────────────────────────────────────
COFFEE_YEAR_PRICE = {
    1999: 3000, 2005: 3300, 2010: 3600, 2012: 3600, 2013: 3900,
    2014: 4100, 2022: 4500, 2025: 4700,
}
COFFEE_MIN_YEAR = min(COFFEE_YEAR_PRICE)


def _nearest_year_at_or_before(table: Dict[int, float], year: int) -> Optional[int]:
    """table에 해당 연도가 없으면 그 이전 중 가장 가까운 연도를 반환한다.

    미래 가격을 과거 시점의 기준값으로 사용하지 않기 위해 이후 연도는 제외한다.
    """
    candidates = [y for y in table if y <= year]
    return max(candidates) if candidates else None


def _fmt_won(amount: float) -> str:
    return f'{round(amount):,}원'


def build_investment_scenarios(date: str) -> List[Dict[str, Any]]:
    """해당 날짜 기준 '샀다면' 카드 목록을 생성한다.

    데이터가 없는 구간(예: 1994년 이전 코스피)은 카드를 생성하지 않으며 추정치로 채우지 않는다.
    """
    year = datetime.strptime(date, DATE_FORMAT).year
    scenarios: List[Dict[str, Any]] = []

    # 코스피
    if year >= KOSPI_MIN_YEAR:
        base_year = _nearest_year_at_or_before(KOSPI_YEAR_END, year)
        if base_year:
            base = KOSPI_YEAR_END[base_year]
            multiple = KOSPI_CURRENT / base
            principal = 1_000_000
            now_value = principal * multiple
            scenarios.append({
                'id': 'kospi',
                'emoji': '📈',
                'label': '코스피',
                'description': f'{base_year}년 말 코스피({base:,}p)에 100만원을 넣었다면',
                'result': f'지금은 약 {_fmt_won(now_value)} (코스피 {KOSPI_CURRENT_LABEL} {KOSPI_CURRENT:,.0f}p 기준, {multiple:.1f}배)',
                'highlight': f'{multiple:.1f}배',
                'story': KOSPI_YEAR_STORY.get(base_year),
                'source_label': f'코스피 {base_year}년 말 종가 {base:,}p, {KOSPI_CURRENT_LABEL} {KOSPI_CURRENT:,.0f}p — 실측치',
            })

    # 비트코인
    if year >= BTC_MIN_YEAR:
        base_year = _nearest_year_at_or_before(BTC_YEAR_END_USD, year)
        if base_year:
            base = BTC_YEAR_END_USD[base_year]
            multiple = BTC_CURRENT_USD / base
            principal = 1_000_000
            now_value = principal * multiple
            scenarios.append({
                'id': 'bitcoin',
                'emoji': '₿',
                'label': '비트코인',
                'description': f'{base_year}년 말 비트코인(개당 ${base:,.1f})에 100만원어치를 사뒀다면',
                'result': f'지금은 약 {_fmt_won(now_value)} (비트코인 {BTC_CURRENT_LABEL} ${BTC_CURRENT_USD:,.0f} 기준, {multiple:,.1f}배)',
                'highlight': f'{multiple:,.1f}배',
                'story': BTC_YEAR_STORY.get(base_year),
                'source_label': f'비트코인 {base_year}년 말 시세 ${base:,.1f}, {BTC_CURRENT_LABEL} ${BTC_CURRENT_USD:,.0f} — 실측치',
            })

    # 로또 — 확률형이라 수익률이 아니라 사실+대조로 보여준다.
    if date >= LOTTO_START_DATE:
        ticket_price = 1000 if date >= LOTTO_PRICE_CHANGE_DATE else 2000
        kospi_note = None
        if year >= KOSPI_MIN_YEAR:
            base_year = _nearest_year_at_or_before(KOSPI_YEAR_END, year)
            if base_year:
                multiple = KOSPI_CURRENT / KOSPI_YEAR_END[base_year]
                kospi_note = f'같은 {ticket_price:,}원을 코스피에 넣었다면 지금 약 {_fmt_won(ticket_price * multiple)}이 됐을 거예요.'
        scenarios.append({
            'id': 'lotto',
            'emoji': '🎟️',
            'label': '로또 6/45',
            'description': f'그날 로또 한 장({ticket_price:,}원)을 샀다면',
            'result': f'1등 당첨 확률은 1/{LOTTO_ODDS_DENOM:,} — 역대 평균 1등 당첨금은 {_fmt_won(LOTTO_AVG_JACKPOT)}이었어요.',
            'highlight': f'1/{LOTTO_ODDS_DENOM:,}',
            'story': kospi_note,
            'source_label': '동행복권 공식 통계(1등 확률·역대 평균 당첨금) — 실측치',
        })

    # 커피(스타벅스 아메리카노 톨) — 실제 가격 × 코스피 수익률
    if year >= COFFEE_MIN_YEAR:
        coffee_year = _nearest_year_at_or_before(COFFEE_YEAR_PRICE, year)
        if coffee_year:
            price = COFFEE_YEAR_PRICE[coffee_year]
            kospi_base_year = _nearest_year_at_or_before(KOSPI_YEAR_END, year) if year >= KOSPI_MIN_YEAR else None
            if kospi_base_year:
                multiple = KOSPI_CURRENT / KOSPI_YEAR_END[kospi_base_year]
                now_value = price * multiple
                scenarios.append({
                    'id': 'coffee',
                    'emoji': '☕',
                    'label': '커피값 아꼈다면',
                    'description': f'그날 스타벅스 아메리카노(톨, {price:,}원) 한 잔 값을 안 쓰고 코스피에 넣었다면',
                    'result': f'지금은 약 {_fmt_won(now_value)} ({multiple:.1f}배)',
                    'highlight': f'{multiple:.1f}배',
                    'story': None,
                    'source_label': f'스타벅스 아메리카노 톨 {coffee_year}년 가격 {price:,}원 — 실측치, 코스피 수익률과 결합',
                })

    return scenarios
