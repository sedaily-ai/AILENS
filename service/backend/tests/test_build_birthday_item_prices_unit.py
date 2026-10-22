"""생일 '그때 1억 원' 품목 배수 수집 스크립트(scripts/build_birthday_item_prices.py) 단위 테스트. 외부 호출(KOSIS·SSM)은 전부 가짜.
실행: cd service/backend && uv run --no-project --with pytest==8.3.0 --with requests==2.32.3 --with boto3==1.35.0 \\
        python -m pytest tests/test_build_birthday_item_prices_unit.py -q
"""
import importlib.util
import json
import os
import traceback
from unittest.mock import MagicMock

import pytest
import requests

_PATH = os.path.join(os.path.dirname(__file__), '..', 'scripts', 'build_birthday_item_prices.py')
_spec = importlib.util.spec_from_file_location('build_birthday_item_prices', _PATH)
ip = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ip)

KEY = 'SECRET-KOSIS-KEY'


def _rows(code, points, region='T11'):
    return [{'C1': region, 'C2': code, 'ITM_ID': 'T', 'PRD_DE': period, 'DT': value} for period, value in points]


def _response(body):
    r = MagicMock()
    r.json.return_value = body
    return r


def _months(year_from, month_from, year_to, month_to, value=lambda year, month: float(year - 1970 + month)):
    out = []
    year, month = year_from, month_from
    while (year, month) <= (year_to, month_to):
        out.append((f'{year}{month:02d}', str(value(year, month))))
        year, month = (year + 1, 1) if month == 12 else (year, month + 1)
    return out


def test_items_are_the_approved_five_in_screen_order():
    assert [(item.name, item.code) for item in ip.ITEMS] == [
        ('짜장면', 'K01119'), ('냉면', 'K01114'), ('시내버스', 'G03201'), ('지하철', 'G03102'), ('김치찌개백반', 'K01101')]
    assert ip.KOSIS_TABLE == {'orgId': '101', 'tblId': 'DT_1J22001', 'itmId': 'T', 'objL1': 'T11', 'prdSe': 'M'}
    assert ip.MONTHS == ('1988-02',)
    with open(_PATH, encoding='utf-8') as fp:
        text = fp.read()
    # 부적합·제외 판정 품목 코드(택시·이발·미용·목욕·영화·커피·담배·삼겹살)는 받지 않는다.
    for code in ('G03203', 'L01103', 'L01104', 'L01101', 'I04201', 'K01133', 'B02101', 'K01112'):
        assert code not in text


def test_fetch_kosis_parses_and_sends_table_params():
    get = MagicMock(return_value=_response(_rows('K01119', [('199002', '21.639'), ('199001', '21.374'), ('199003', '-')])))
    points = ip.fetch_kosis('K01119', '199001', '199003', KEY, get=get)
    assert points == [('1990-01', 21.374), ('1990-02', 21.639)]
    params = get.call_args.kwargs['params']
    assert get.call_args.args[0] == ip.KOSIS_URL
    assert params['objL1'] == 'T11' and params['objL2'] == 'K01119' and params['tblId'] == 'DT_1J22001'
    assert params['prdSe'] == 'M' and params['jsonVD'] == 'Y' and params['format'] == 'json'
    assert params['startPrdDe'] == '199001' and params['endPrdDe'] == '199003'


def test_fetch_kosis_rejects_other_series():
    get = MagicMock(return_value=_response(_rows('K01119', [('199001', '21.374')], region='T10')))
    with pytest.raises(ip.KosisError):
        ip.fetch_kosis('K01119', '199001', '199001', KEY, get=get)


def test_fetch_kosis_no_data_and_errors_never_leak_key():
    assert ip.fetch_kosis('K01101', '197501', '197512', KEY, get=MagicMock(return_value=_response({'err': '30', 'errMsg': '데이터가 존재하지 않습니다.'}))) == []
    for body in ({'err': '11', 'errMsg': f'인증키 {KEY} 기간만료'}, {'err': f'E {KEY}', 'errMsg': KEY}, 'not a list'):
        with pytest.raises(ip.KosisError) as caught:
            ip.fetch_kosis('K01119', '197501', '202609', KEY, get=MagicMock(return_value=_response(body)))
        error = caught.value
        assert KEY not in str(error) and 'K01119' in str(error)
    url = f'{ip.KOSIS_URL}?method=getList&apiKey={KEY}&objL2=K01119'
    broken = MagicMock()
    broken.json.side_effect = ValueError(f'Expecting value: {url}')
    for get in (MagicMock(side_effect=requests.ConnectionError(f'Max retries exceeded with url: {url}')), MagicMock(return_value=broken)):
        with pytest.raises(ip.KosisError) as caught:
            ip.fetch_kosis('K01119', '197501', '202609', KEY, get=get)
        error = caught.value
        assert KEY not in str(error) and error.__cause__ is None and error.__suppress_context__ is True
        assert KEY not in ''.join(traceback.format_exception(type(error), error, error.__traceback__))


def test_annual_means_only_full_years_and_rejects_gap():
    points = [(f'1990-{m:02d}', float(m)) for m in range(1, 13)] + [('1991-01', 20.0), ('1991-02', 22.0)]
    assert ip.annual_means(points) == {'1990': 6.5}  # 1991은 두 달뿐이라 빠진다
    assert ip.annual_means([]) == {}
    with pytest.raises(ValueError):
        ip.annual_means([('1990-01', 1.0), ('1990-03', 1.0)])


def test_build_keeps_now_months_and_start():
    series = {item.id: [(f'{y}-{m:02d}', float(y - 1980 + m)) for y in (1987, 1988) for m in range(1, 13)] + [('1989-01', 50.0)]
              for item in ip.ITEMS}
    data = ip.build(series, '1989-01')
    assert data['now'] == '1989-01' and data['source'] == ip.SOURCE and data['region'] == '서울'
    first = data['items'][0]
    assert first['name'] == '짜장면' and first['from'] == '1987-01' and first['latest'] == 50.0
    assert first['annual'] == {'1987': 13.5, '1988': 14.5} and first['monthly'] == {'1988-02': 10.0}
    with pytest.raises(ValueError):
        ip.build(series, '1989-02')


def test_main_writes_file_and_never_prints_key(tmp_path, capsys):
    starts = {'K01119': 1975, 'K01114': 1975, 'G03201': 1975, 'G03102': 1980, 'K01101': 1985}
    calls = []

    def get(url, params, timeout):
        calls.append(params)
        assert url == ip.KOSIS_URL and params['apiKey'] == KEY
        return _response(_rows(params['objL2'], _months(starts[params['objL2']], 1, 2026, 9)))

    out = tmp_path / 'items.json'
    assert ip.main(['--now', '2026-09', '--out', str(out)], get=get, secret=lambda name: KEY) == 0
    assert len(calls) == 5 and all(c['startPrdDe'] == '197501' and c['endPrdDe'] == '202609' for c in calls)
    printed = capsys.readouterr()
    assert KEY not in printed.out and KEY not in printed.err and 'now=2026-09' in printed.out
    text = out.read_text(encoding='utf-8')
    assert KEY not in text
    data = json.loads(text)
    by_id = {item['id']: item for item in data['items']}
    assert [item['id'] for item in data['items']] == [item.id for item in ip.ITEMS]
    assert by_id['subway']['from'] == '1980-01' and '1979' not in by_id['subway']['annual']
    assert by_id['kimchi_stew']['from'] == '1985-01' and '1984' not in by_id['kimchi_stew']['annual']
    assert '2026' not in by_id['bus']['annual'] and '2025' in by_id['bus']['annual']  # 2026은 9달뿐
    assert by_id['bus']['latest'] == float(2026 - 1970 + 9)


def test_main_requires_now_month(tmp_path):
    for argv in ([], ['--now', '2026-13'], ['--now', '202609']):
        with pytest.raises(SystemExit):
            ip.main(argv + ['--out', str(tmp_path / 'x.json')], get=MagicMock(), secret=MagicMock())
    assert list(tmp_path.iterdir()) == []


def test_main_stops_when_an_item_has_no_data(tmp_path):
    get = MagicMock(return_value=_response({'err': '30', 'errMsg': '데이터가 존재하지 않습니다.'}))
    with pytest.raises(ip.KosisError):
        ip.main(['--now', '2026-09', '--out', str(tmp_path / 'x.json')], get=get, secret=lambda name: KEY)
    assert list(tmp_path.iterdir()) == []
