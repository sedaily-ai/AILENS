"""생일 자산 시세 수집 스크립트(scripts/build_birthday_assets.py) 단위 테스트. 외부 호출(ECOS·세계은행·SSM)은 전부 가짜.
실행: cd service/backend && python3 -m pytest tests/test_build_birthday_assets_unit.py -q  (openpyxl 필요)
"""
import importlib.util
import io
import json
import os
from dataclasses import replace
from unittest.mock import MagicMock

import pytest

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
    return {
        'usdkrw_daily': [('1964-05-04', 255.77)] + daily,
        'usdkrw_monthly': [('1964-05', 255.77), ('1996-01', 785.2)],
        'kospi_daily': [('1995-01-03', 1013.57), ('1995-12-28', 882.94), ('1996-01-03', 888.0)],
        'kospi_annual': [('1976', 97.93), ('1990', 747.0), ('1994', 965.0)],
        'apartment': [('1986-01', 12.066), ('1996-01', 30.1)],
        'gold': [('1964-05', 35.0), ('1996-01', 399.5)],
    }


def test_year_file_includes_previous_year_tail():
    files = ba.build_year_files(_series(), ['usdkrw'], 1995, 1996)
    daily = files[1996]['usdkrw']['daily']
    assert len([p for p in daily if p[0] < '1996-01-01']) == ba.TAIL_DAYS
    assert daily[0][0] == '1995-12-20' and ('1996-01-02', 780.0) in daily
    assert files[1996]['usdkrw']['monthly'] == [('1996-01', 785.2)]


def test_kospi_annual_before_1995():
    files = ba.build_year_files(_series(), ['kospi'], 1990, 1996)
    assert files[1990]['kospi'] == {'daily': [], 'annual': 747.0}
    assert files[1995]['kospi']['annual'] is None and files[1995]['kospi']['daily'][0] == ('1995-01-03', 1013.57)
    assert files[1996]['kospi']['daily'][0] == ('1995-01-03', 1013.57)  # 전년 꼬리(10일 미만이면 있는 만큼)


def test_series_outside_range_are_empty():
    files = ba.build_year_files(_series(), ['usdkrw', 'kospi', 'apartment', 'gold'], 1964, 1980)
    assert files[1980]['apartment'] == []
    assert files[1970]['kospi'] == {'daily': [], 'annual': None}
    assert files[1964]['gold'] == [('1964-05', 35.0)]


def test_only_allowed_items_are_written():
    files = ba.build_year_files(_series(), ['apartment'], 1996, 1996)
    assert set(files[1996]) == {'year', 'apartment'}
    latest = ba.build_latest(_series(), ['apartment'], '2026-10-21T00:00:00+09:00')
    assert latest['apartment'] == ['1996-01', 30.1] and set(latest['sources']) == {'apartment'}


def test_gold_needs_exchange_rate_source(monkeypatch):
    _allow(monkeypatch, 'gold')
    assert ba.allowed_items() == []
    _allow(monkeypatch, 'gold', 'usdkrw')
    assert ba.allowed_items() == ['usdkrw', 'gold']


def test_fetch_ecos_normalizes_and_paginates(monkeypatch):
    monkeypatch.setattr(ba, 'ECOS_PAGE', 2)
    get = MagicMock(side_effect=[_ecos([('19640505', '255.77'), ('19640504', '255.77')], total=3), _ecos([('19640506', '256.1')], total=3)])
    points = ba.fetch_ecos('731Y001', 'D', '19640504', '19640506', '0000001', KEY, get=get)
    assert points == [('1964-05-04', 255.77), ('1964-05-05', 255.77), ('1964-05-06', 256.1)]
    assert '/1/2/731Y001/D/19640504/19640506/0000001' in get.call_args_list[0].args[0]
    assert '/3/4/' in get.call_args_list[1].args[0]
    monthly = ba.fetch_ecos('731Y004', 'M', '202608', '202608', '0000001/0000100', KEY, get=MagicMock(return_value=_ecos([('202608', '1406.3')])))
    assert monthly == [('2026-08', 1406.3)]


def test_fetch_ecos_no_data_and_error_never_leak_key():
    assert ba.fetch_ecos('901Y014', 'M', '197601', '197603', '1080000', KEY, get=MagicMock(return_value=_no_data())) == []
    bad = MagicMock()
    bad.json.return_value = {'RESULT': {'CODE': 'INFO-100', 'MESSAGE': '인증키가 유효하지 않습니다.'}}
    with pytest.raises(ba.EcosError) as caught:
        ba.fetch_ecos('731Y001', 'D', '19640504', '19640506', '0000001', KEY, get=MagicMock(return_value=bad))
    assert KEY not in str(caught.value)


def test_pink_sheet_finds_gold_by_header():
    from openpyxl import Workbook

    book = Workbook()
    sheet = book.active
    sheet.title = 'Monthly Prices'
    sheet.append(['World Bank Commodity Price Data'])
    sheet.append([None, 'Crude oil, average', 'Silver', 'Gold'])  # 열 순서가 바뀌어도 제목으로 찾는다
    sheet.append([None, '($/bbl)', '($/troy oz)', '($/troy oz)'])
    sheet.append(['1960M01', 1.63, 0.91, 35.27])
    sheet.append(['1960M02', 1.63, 0.91, '..'])
    sheet.append(['2026M09', 102.3, 64.6, 4319.0])
    data = io.BytesIO()
    book.save(data)
    assert ba.parse_pink_sheet_gold(data.getvalue()) == [('1960-01', 35.27), ('2026-09', 4319.0)]


def test_nothing_allowed_writes_nothing(monkeypatch, tmp_path, capsys):
    _allow(monkeypatch)
    secret = MagicMock()
    assert ba.main(['--out', str(tmp_path)], get=MagicMock(), secret=secret) == 0
    assert list(tmp_path.iterdir()) == [] and secret.call_count == 0
    assert '아무 파일도 쓰지 않았다' in capsys.readouterr().out


def test_main_writes_year_files_and_never_prints_key(monkeypatch, tmp_path, capsys):
    _allow(monkeypatch, 'usdkrw', 'apartment')

    def get(url, timeout):
        if '/731Y001/' in url:
            return _ecos([('19640504', '255.77'), ('20261019', '1332.1')])
        if '/731Y004/' in url:
            return _ecos([('196405', '255.77'), ('202609', '1359')])
        return _ecos([('198601', '12.066'), ('202609', '109.352')])

    assert ba.main(['--out', str(tmp_path), '--until', '2026-10-19'], get=get, secret=lambda name: KEY) == 0
    out = capsys.readouterr().out
    assert KEY not in out and 'items=usdkrw,apartment' in out
    assert len(list(tmp_path.glob('*.json'))) == (2026 - 1964 + 1) + 1
    latest = json.loads((tmp_path / 'latest.json').read_text(encoding='utf-8'))
    assert latest['usdkrw']['daily'] == ['2026-10-19', 1332.1] and latest['apartment'] == ['2026-09', 109.352]
    assert KEY not in (tmp_path / '1986.json').read_text(encoding='utf-8')
