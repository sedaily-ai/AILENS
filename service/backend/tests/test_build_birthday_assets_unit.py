"""생일 자산 공식 통계 수집 스크립트(scripts/build_birthday_assets.py) 단위 테스트. 외부 호출(ECOS·SSM)은 전부 가짜.
실행: cd service/backend && uv run --no-project --with pytest==8.3.0 --with requests==2.32.3 --with boto3==1.35.0 \\
        python -m pytest tests/test_build_birthday_assets_unit.py -q
"""
import importlib.util
import json
import os
import traceback
from dataclasses import replace
from datetime import datetime
from unittest.mock import MagicMock

import pytest
import requests

_PATH = os.path.join(os.path.dirname(__file__), '..', 'scripts', 'build_birthday_assets.py')
_spec = importlib.util.spec_from_file_location('build_birthday_assets', _PATH)
ba = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(ba)

KEY = 'SECRET-ECOS-KEY'


def _ecos(rows, total=None):
    r = MagicMock()
    r.json.return_value = {'StatisticSearch': {'list_total_count': total if total is not None else len(rows),
                                               'row': [{'TIME': t, 'DATA_VALUE': v} for t, v in rows]}}
    return r


def _no_data():
    r = MagicMock()
    r.json.return_value = {'RESULT': {'CODE': 'INFO-200', 'MESSAGE': '해당하는 데이터가 없습니다.'}}
    return r


def _allow(monkeypatch, *names):
    monkeypatch.setattr(ba, 'SOURCES', {k: replace(v, allowed=k in names) for k, v in ba.SOURCES.items()})


def _series():
    daily = [(f'1995-12-{d:02d}', 770.0 + d) for d in range(15, 30)] + [('1996-01-02', 780.0), ('1996-06-03', 790.0)]
    rates = [('1996-01', 12.0), ('1996-02', 6.0)]
    index, following = ba.deposit_index(rates)
    return {
        'cpi': [('1965-01', 2.493), ('1996-01', 45.0)],
        'deposit_rate': rates,
        'deposit_index': index,
        'deposit_next': following,
        'usdkrw_daily': [('1990-03-02', 693.0)] + daily,
        'usdkrw_monthly': [('1964-05', 255.77), ('1996-01', 785.2)],
        'apartment': [('2006-01', 28.8), ('2026-07', 101.9)],
        'gold': [('1965-01', 0.51), ('1996-01', 8.12)],
    }


def test_year_file_includes_previous_year_tail():
    files = ba.build_year_files(_series(), ['usdkrw'], 1995, 1996)
    daily = files[1996]['usdkrw']['daily']
    assert len([p for p in daily if p[0] < '1996-01-01']) == ba.TAIL_DAYS
    assert daily[0][0] == '1995-12-20' and ('1996-01-02', 780.0) in daily
    assert files[1996]['usdkrw']['monthly'] == [('1996-01', 785.2)]
    assert files[1995]['usdkrw']['daily'][0] == ('1990-03-02', 693.0)  # 전년 꼬리는 TAIL_DAYS 보다 적으면 있는 만큼


def test_deposit_index_compounds_monthly():
    index, following = ba.deposit_index([('1996-01', 12.0), ('1996-02', 6.0)])
    assert index == [('1996-01', 1.0), ('1996-02', 1.01)]
    assert following[0] == '1996-03' and following[1] == pytest.approx(1.01 * 1.005, rel=1e-12)
    assert ba.deposit_index([]) == ([], None)
    assert ba.deposit_index([('1996-12', 0.0)])[1] == ('1997-01', 1.0)  # 해 넘김


def test_deposit_index_rejects_gap():
    with pytest.raises(ValueError):
        ba.deposit_index([('1996-01', 9.12), ('1996-03', 9.0)])


def test_year_file_and_latest_split_deposit():
    series = _series()
    files = ba.build_year_files(series, ['deposit'], 1996, 1996)
    assert files[1996]['deposit'] == [('1996-01', 1.0), ('1996-02', 1.01)]  # 금리가 있는 달까지만
    latest = ba.build_latest(series, ['deposit'], '2026-10-21T00:00:00+09:00', '2026-10-20')
    assert latest['deposit'][0] == '1996-03' and latest['deposit'][1] == pytest.approx(1.01 * 1.005)
    assert latest['last'] == {'deposit_rate': '1996-02'}


def test_series_outside_range_are_empty():
    files = ba.build_year_files(_series(), ['cpi', 'deposit', 'usdkrw', 'apartment'], 1964, 1980)
    assert files[1980]['apartment'] == [] and files[1980]['deposit'] == []
    assert files[1980]['usdkrw']['daily'] == []
    assert files[1964]['cpi'] == [] and files[1964]['usdkrw']['monthly'] == [('1964-05', 255.77)]
    assert all('generatedAt' not in data for data in files.values())


def test_only_allowed_items_are_written():
    files = ba.build_year_files(_series(), ['apartment'], 2006, 2006)
    assert set(files[2006]) == {'year', 'apartment'}
    latest = ba.build_latest(_series(), ['apartment'], '2026-10-21T00:00:00+09:00', '2026-10-20')
    assert latest['apartment'] == ['2026-07', 101.9] and set(latest['sources']) == {'apartment'}
    assert latest['last'] == {'apartment': '2026-07'} and 'usdkrw' not in latest and 'gold' not in latest


def test_default_sources_are_the_approved_ones():
    # 금은 한국은행 생산자물가지수 품목별 금괴(404Y016) — 다른 칸처럼 ECOS 한 계열이다.
    assert ba.allowed_items() == ['cpi', 'deposit', 'usdkrw', 'apartment', 'gold']
    assert 'kospi' not in ba.SOURCES and ba.SOURCES['gold'].allowed is True
    assert ba.ECOS_SERIES['gold'] == ('404Y016', 'M', '196501', None, '30721401AA')
    assert '404Y016' in ba.SOURCES['gold'].label and ba.SERIES_OF['gold'] == ('gold',)
    assert {series[0] for series in ba.ECOS_SERIES.values()} == {'901Y009', '121Y002', '731Y003', '731Y004', '901Y089', '404Y016'}
    with open(_PATH, encoding='utf-8') as fp:
        text = fp.read()
    assert 'kospi' not in text.lower()
    for table in ('731Y001', '901Y062', '802Y001', '901Y014', '902Y003', '901Y093', '901Y149'):
        assert table not in text


def test_gold_is_its_own_ecos_series(monkeypatch):
    _allow(monkeypatch, 'gold')
    assert ba.allowed_items() == ['gold']
    series = _series()
    files = ba.build_year_files(series, ['gold'], 1964, 1965)
    assert files[1964] == {'year': 1964, 'gold': []} and files[1965]['gold'] == [('1965-01', 0.51)]
    latest = ba.build_latest(series, ['gold'], '2026-10-21T00:00:00+09:00', '2026-10-20')
    assert latest['gold'] == ['1996-01', 8.12] and latest['last'] == {'gold': '1996-01'}
    assert set(latest['sources']) == {'gold'} and 'usdkrw' not in latest


def test_fetch_ecos_normalizes_and_paginates(monkeypatch):
    monkeypatch.setattr(ba, 'ECOS_PAGE', 2)
    get = MagicMock(side_effect=[_ecos([('19900303', '694.1'), ('19900302', '693')], total=3), _ecos([('19900305', '695.2')], total=3)])
    points = ba.fetch_ecos('731Y003', 'D', '19900302', '19900305', '0000003', KEY, get=get)
    assert points == [('1990-03-02', 693.0), ('1990-03-03', 694.1), ('1990-03-05', 695.2)]
    assert '/1/2/731Y003/D/19900302/19900305/0000003' in get.call_args_list[0].args[0]
    assert '/3/4/' in get.call_args_list[1].args[0]
    monthly = ba.fetch_ecos('731Y004', 'M', '202608', '202608', '0000001/0000100', KEY, get=MagicMock(return_value=_ecos([('202608', '1406.3')])))
    assert monthly == [('2026-08', 1406.3)]


def test_fetch_ecos_no_data_and_error_never_leak_key():
    assert ba.fetch_ecos('901Y089', 'M', '200001', '200003', '200', KEY, get=MagicMock(return_value=_no_data())) == []
    bad = MagicMock()
    bad.json.return_value = {'RESULT': {'CODE': 'INFO-100', 'MESSAGE': '인증키가 유효하지 않습니다.'}}
    with pytest.raises(ba.EcosError) as caught:
        ba.fetch_ecos('731Y003', 'D', '19900302', '19900305', '0000003', KEY, get=MagicMock(return_value=bad))
    assert KEY not in str(caught.value) and 'INFO-100' in str(caught.value)


def test_ecos_error_message_echoing_key_never_leaks(tmp_path, capsys):
    # ECOS 오류 응답의 MESSAGE·CODE 가 요청 인증키를 되풀이해도 예외 문자열·traceback·출력 어디에도 남지 않는다.
    for result in ({'CODE': 'INFO-100', 'MESSAGE': f'bad key {KEY}'}, {'CODE': f'ERR {KEY}', 'MESSAGE': KEY}):
        echo = MagicMock()
        echo.json.return_value = {'RESULT': result}
        with pytest.raises(ba.EcosError) as caught:
            ba.main(['--out', str(tmp_path), '--until', '2026-10-19'],
                    get=MagicMock(return_value=echo), secret=lambda name: KEY)
        error = caught.value
        assert KEY not in str(error) and '901Y009' in str(error)
        assert KEY not in ''.join(traceback.format_exception(type(error), error, error.__traceback__))
        captured = capsys.readouterr()
        assert KEY not in captured.out and KEY not in captured.err and list(tmp_path.iterdir()) == []


def test_fetch_ecos_request_error_never_leaks_key():
    url = f'https://ecos.bok.or.kr/api/StatisticSearch/{KEY}/json/kr/1/100000/731Y003/D/19900302/19900305/0000003'
    broken = MagicMock()
    broken.json.side_effect = ValueError(f'Expecting value: {url}')
    for get in (MagicMock(side_effect=requests.ConnectionError(f'Max retries exceeded with url: {url}')),
                MagicMock(return_value=broken)):
        with pytest.raises(ba.EcosError) as caught:
            ba.fetch_ecos('731Y003', 'D', '19900302', '19900305', '0000003', KEY, get=get)
        error = caught.value
        assert KEY not in str(error) and '731Y003' in str(error)
        assert error.__suppress_context__ is True and error.__cause__ is None
        assert KEY not in ''.join(traceback.format_exception(type(error), error, error.__traceback__))


def test_nothing_allowed_writes_nothing(monkeypatch, tmp_path, capsys):
    _allow(monkeypatch)
    secret = MagicMock()
    assert ba.main(['--out', str(tmp_path)], get=MagicMock(), secret=secret) == 0
    assert list(tmp_path.iterdir()) == [] and secret.call_count == 0
    assert '아무 파일도 쓰지 않았다' in capsys.readouterr().out


def test_main_writes_year_files_and_never_prints_key(tmp_path, capsys):
    responses = {
        '901Y009': [('196501', '2.493'), ('202609', '120.43')],
        '121Y002': [('202607', '3.2'), ('202608', '3.14')],
        '731Y003': [('19900302', '693'), ('20261019', '1332.1')],
        '731Y004': [('196405', '255.77'), ('202609', '1359')],
        '901Y089': [('200601', '28.8'), ('202607', '101.9')],
        '404Y016': [('196501', '0.51'), ('202608', '275.1'), ('202609', '281.92')],
    }
    urls = []

    def get(url, timeout):
        urls.append(url)
        table = next(t for t in responses if f'/{t}/' in url)
        return _ecos(responses[table])

    assert ba.main(['--out', str(tmp_path), '--until', '2026-10-19'], get=get, secret=lambda name: KEY) == 0
    # 외부 요청은 ECOS 뿐이고, 금은 404Y016 금괴 항목 하나다.
    assert all(url.startswith('https://ecos.bok.or.kr/api/StatisticSearch/') for url in urls) and len(urls) == 6
    assert any('/404Y016/M/196501/202610/30721401AA' in url for url in urls)
    out = capsys.readouterr().out
    assert KEY not in out and 'items=cpi,deposit,usdkrw,apartment,gold' in out and 'files=' in out and 'max=' in out
    years = max(2026, datetime.now(ba.KST).year) - 1964 + 1
    assert len(list(tmp_path.glob('*.json'))) == years + 1
    latest = json.loads((tmp_path / 'latest.json').read_text(encoding='utf-8'))
    assert latest['generatedAt'].endswith('+09:00') and latest['until'] == '2026-10-19'
    assert latest['last'] == {'cpi': '2026-09', 'deposit_rate': '2026-08', 'usdkrw_daily': '2026-10-19',
                              'usdkrw_monthly': '2026-09', 'apartment': '2026-07', 'gold': '2026-09'}
    assert latest['gold'] == ['2026-09', 281.92]
    assert '404Y016' in latest['sources']['gold']
    assert latest['cpi'] == ['2026-09', 120.43]
    assert latest['deposit'][0] == '2026-09' and latest['deposit'][1] == pytest.approx((1 + 3.2 / 1200) * (1 + 3.14 / 1200))
    assert latest['usdkrw'] == {'daily': ['2026-10-19', 1332.1], 'monthly': ['2026-09', 1359.0]}
    assert latest['apartment'] == ['2026-07', 101.9]
    year_2026 = json.loads((tmp_path / '2026.json').read_text(encoding='utf-8'))
    assert set(year_2026) == {'year', 'cpi', 'deposit', 'usdkrw', 'apartment', 'gold'}
    assert year_2026['deposit'] == [['2026-07', 1.0], ['2026-08', pytest.approx(1 + 3.2 / 1200)]]
    assert year_2026['gold'] == [['2026-08', 275.1], ['2026-09', 281.92]]
    assert json.loads((tmp_path / '1964.json').read_text(encoding='utf-8'))['gold'] == []  # 금괴 지수는 1965-01부터
    for path in tmp_path.glob('*.json'):
        assert KEY not in path.read_text(encoding='utf-8')
