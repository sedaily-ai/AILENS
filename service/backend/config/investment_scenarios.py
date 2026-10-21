"""
/timeline/{날짜}(과거 구간) "그때와 지금의 숫자" 카드 — 공식 통계나 뉴스 보도로 확인한 생활 숫자만 쓴다.

- 로또 6/45(동행복권 공식 통계): 1회차 2002-12-07(토) 추첨 시작, 1등 확률 1/8,145,060, 역대 평균 1등
  당첨금 2,014,003,760원. 2004-08-07(88회차)부터 한 게임 가격이 2,000원→1,000원으로 바뀜.
- 스타벅스 아메리카노(톨): 1999~2025 가격표(뉴스 보도 정리본). 표에 있는 해의 가격이 다음 표 연도 전까지
  이어진다고 본다.

수익률·배수 계산은 하지 않는다. 코스피 등 지수·가상자산 카드는 상업 이용 근거가 있는 출처가 없어
2026-10-22 뺐다(docs/worklog/2026-10/2026-10-22-타임라인-투자카드-정리.md). 로또는 확률형이라 확률과
평균 당첨금을 사실 그대로만 적는다. 데이터가 없는 구간(로또 1회차 전, 커피 1999년 전)은 카드를 만들지
않으며 추정치로 채우지 않는다.
"""
from datetime import datetime
from typing import Any, Dict, List, Optional

DATE_FORMAT = '%Y-%m-%d'

# ─── 로또 6/45 ───────────────────────────────────────────────────────────
LOTTO_START_DATE = '2002-12-07'
LOTTO_PRICE_CHANGE_DATE = '2004-08-07'  # 88회차부터 한 게임 2,000원→1,000원
LOTTO_ODDS_DENOM = 8_145_060
LOTTO_AVG_JACKPOT = 2_014_003_760
LOTTO_MAX_JACKPOT = 40_722_960_000  # 역대 최고 1등 당첨금(2003년 19회차)

# ─── 스타벅스 아메리카노(톨) ───────────────────────────────────────────────
COFFEE_YEAR_PRICE = {
    1999: 3000, 2005: 3300, 2010: 3600, 2012: 3600, 2013: 3900,
    2014: 4100, 2022: 4500, 2025: 4700,
}
COFFEE_MIN_YEAR = min(COFFEE_YEAR_PRICE)
COFFEE_LATEST_YEAR = max(COFFEE_YEAR_PRICE)


def _nearest_year_at_or_before(table: Dict[int, float], year: int) -> Optional[int]:
    """table에 해당 연도가 없으면 그 이전 중 가장 가까운 연도를 반환한다.

    미래 가격을 과거 시점의 기준값으로 사용하지 않기 위해 이후 연도는 제외한다.
    """
    candidates = [y for y in table if y <= year]
    return max(candidates) if candidates else None


def _fmt_won(amount: float) -> str:
    return f'{round(amount):,}원'


def build_investment_scenarios(date: str) -> List[Dict[str, Any]]:
    """해당 날짜의 '그때와 지금의 숫자' 카드 목록(로또 → 커피 순).

    응답 키(investments)와 함수 이름은 웹·테스트와의 호환을 위해 그대로 둔다.
    """
    year = datetime.strptime(date, DATE_FORMAT).year
    scenarios: List[Dict[str, Any]] = []

    # 로또 — 확률형이라 수익률이 아니라 공식 통계 사실만 보여 준다.
    if date >= LOTTO_START_DATE:
        before_change = date < LOTTO_PRICE_CHANGE_DATE
        game_price = 2000 if before_change else 1000
        scenarios.append({
            'id': 'lotto',
            'emoji': '🎟️',
            'label': '로또 6/45',
            'description': f'그때 한 게임 {game_price:,}원',
            'result': f'1등 당첨 확률은 1/{LOTTO_ODDS_DENOM:,} — 역대 평균 1등 당첨금은 {_fmt_won(LOTTO_AVG_JACKPOT)}이었어요.',
            'story': '2004년 8월 88회차부터 한 게임 1,000원으로 내렸어요.' if before_change else None,
            'source_label': '동행복권 공식 통계(1등 확률·역대 평균 1등 당첨금·한 게임 가격)',
        })

    # 커피(스타벅스 아메리카노 톨) — 그때 가격과 표의 가장 최근 가격을 나란히 적는다.
    if year >= COFFEE_MIN_YEAR:
        coffee_year = _nearest_year_at_or_before(COFFEE_YEAR_PRICE, year)
        if coffee_year:
            price = COFFEE_YEAR_PRICE[coffee_year]
            latest = COFFEE_YEAR_PRICE[COFFEE_LATEST_YEAR]
            price_years = (f'{coffee_year}년' if coffee_year == COFFEE_LATEST_YEAR
                           else f'{coffee_year}년·{COFFEE_LATEST_YEAR}년')
            scenarios.append({
                'id': 'coffee',
                'emoji': '☕',
                'label': '스타벅스 아메리카노',
                'description': '톨 사이즈 한 잔',
                'result': f'그때 {_fmt_won(price)} → {COFFEE_LATEST_YEAR}년 {_fmt_won(latest)}',
                'story': None,
                'source_label': f'당시 가격은 뉴스 보도 기준({price_years} 가격)',
            })

    return scenarios
