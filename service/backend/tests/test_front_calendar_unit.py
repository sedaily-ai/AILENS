"""생일 1면 대체가 쓰는 '1면 없는 날' 목록(services.timeline.front_calendar) 단위 테스트.
실행: cd service/backend && python3 -m pytest tests/test_front_calendar_unit.py -q
"""
import json

import pytest

from services.timeline import front_calendar as fc


def test_known_front_inside_outside_and_unknown(tmp_path):
    path = tmp_path / 'cal.json'
    path.write_text(json.dumps({'covers': [['2017-11-13', '2026-10-19']], 'no_front': ['2018-04-21'], 'unknown': ['2020-01-02']}))
    cal = fc.load_calendar(path)
    assert cal.known_front('2018-04-20') is True
    assert cal.known_front('2018-04-21') is False
    assert cal.known_front('2020-01-02') is None
    assert cal.known_front('2026-10-20') is None
    assert cal.known_front('2010-05-12') is None


@pytest.mark.parametrize('text', [None, '{', '{"covers": "x"}', '{"covers": [["2018-01-01"]]}', '{"covers": [], "no_front": [1]}'])
def test_missing_or_broken_file_covers_nothing(tmp_path, text):
    path = tmp_path / 'cal.json'
    if text is not None:
        path.write_text(text)
    assert fc.load_calendar(path).known_front('2018-04-20') is None


def test_bundled_calendar_is_valid_when_present():
    # 수집 결과(작업 3)가 저장소에 있으면 형식이 맞아야 한다 — 깨지면 서버가 조용히 느려진다.
    if not fc.CALENDAR_PATH.exists():
        pytest.skip('수집 전')
    raw = json.loads(fc.CALENDAR_PATH.read_text(encoding='utf-8'))
    cal = fc.load_calendar()
    assert cal.ranges and cal is not fc.EMPTY_CALENDAR
    assert raw['no_front'] == sorted(raw['no_front'])
    assert all(cal.known_front(date) is False for date in raw['no_front'])
