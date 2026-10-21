"""/timeline/{날짜} '그때와 지금의 숫자' 카드(config/investment_scenarios.py) 단위 테스트 — 외부 호출 없음.

실행: cd service/backend && python3 -m pytest tests/test_investment_scenarios_unit.py -q
"""
import pytest

from config import investment_scenarios as inv

# 투자를 부추기거나 지수·가상자산 수익률을 떠올리게 하는 말. 카드 글자 어디에도 나오면 안 된다.
FORBIDDEN_WORDS = ('샀', '투자', '수익', '코스피', '넣었다면', '아꼈다면', '배)', '$')


def _ids(date):
    return [s['id'] for s in inv.build_investment_scenarios(date)]


def _texts(scenario):
    return [v for k, v in scenario.items() if k != 'id' and isinstance(v, str)]


@pytest.mark.parametrize('date, expected', [
    ('1990-01-01', []),
    ('1995-01-01', []),
    ('1998-12-31', []),
    ('1999-01-01', ['coffee']),
    ('2002-12-06', ['coffee']),
    ('2002-12-07', ['lotto', 'coffee']),
    ('2003-07-22', ['lotto', 'coffee']),
    ('2008-09-16', ['lotto', 'coffee']),
    ('2026-01-31', ['lotto', 'coffee']),
])
def test_cards_by_date(date, expected):
    assert _ids(date) == expected


def test_index_and_crypto_cards_are_gone():
    for year in range(1990, 2027):
        for date in (f'{year}-01-01', f'{year}-07-01', f'{year}-12-31'):
            assert set(_ids(date)) <= {'lotto', 'coffee'}
    # 지수·가상자산 시세표·현재가·연도 문구 상수(KOSPI_*, BTC_*)가 모듈에 남지 않는다.
    assert [n for n in dir(inv) if n.startswith(('KOSPI', 'BTC'))] == []


@pytest.mark.parametrize('date', ['1999-03-01', '2002-12-07', '2003-07-22', '2008-09-16', '2025-06-01'])
def test_no_investment_wording_or_return_fields(date):
    for s in inv.build_investment_scenarios(date):
        assert set(s) == {'id', 'emoji', 'label', 'description', 'result', 'story', 'source_label'}
        for text in _texts(s):
            for word in FORBIDDEN_WORDS:
                assert word not in text, (date, s['id'], word, text)


def test_lotto_before_price_change():
    lotto = inv.build_investment_scenarios('2003-07-22')[0]
    assert lotto['description'] == '그때 한 게임 2,000원'
    assert lotto['result'] == '1등 당첨 확률은 1/8,145,060 — 역대 평균 1등 당첨금은 2,014,003,760원이었어요.'
    assert lotto['story'] == '2004년 8월 88회차부터 한 게임 1,000원으로 내렸어요.'
    assert lotto['source_label'].startswith('동행복권 공식 통계')


def test_lotto_after_price_change_has_no_comparison_line():
    for date in ('2004-08-07', '2008-09-16'):
        lotto = inv.build_investment_scenarios(date)[0]
        assert lotto['description'] == '그때 한 게임 1,000원'
        assert lotto['story'] is None


def test_coffee_then_and_latest_price():
    coffee = inv.build_investment_scenarios('2008-09-16')[1]
    assert coffee['label'] == '스타벅스 아메리카노'
    assert coffee['result'] == '그때 3,300원 → 2025년 4,700원'
    assert coffee['source_label'] == '당시 가격은 뉴스 보도 기준(2005년·2025년 가격)'
    assert coffee['story'] is None


def test_coffee_latest_year_source_is_not_repeated():
    coffee = inv.build_investment_scenarios('2025-06-01')[1]
    assert coffee['result'] == '그때 4,700원 → 2025년 4,700원'
    assert coffee['source_label'] == '당시 가격은 뉴스 보도 기준(2025년 가격)'
