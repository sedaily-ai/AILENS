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


def test_bundled_calendar_is_valid():
    # Lambda zip 에 함께 들어가는 수집 결과. 없거나 깨지면 서버가 조용히 느려지므로(모든 날짜를 빅카인즈로 확인) 테스트로 막는다.
    assert fc.CALENDAR_PATH.exists(), 'scripts/build_front_page_calendar.py 로 수집한 목록이 필요하다'
    raw = json.loads(fc.CALENDAR_PATH.read_text(encoding='utf-8'))
    cal = fc.load_calendar()
    assert cal.ranges and cal is not fc.EMPTY_CALENDAR
    assert raw['no_front'] == sorted(raw['no_front'])
    assert all(cal.known_front(date) is False for date in raw['no_front'])
    assert raw['unknown'] == []  # 남은 unknown 은 --recheck-unknown 으로 비운 뒤 커밋한다
    # 2026-10-20 실측과 같은지: 명절·보관본 누락은 없음, 평범한 발행일은 있음.
    assert {'2018-04-21', '2025-10-06', '2025-10-09', '1995-03-05'} <= set(raw['no_front'])
    assert {'1996-06-01', '2018-02-15', '2024-09-19', '2024-10-12'}.isdisjoint(raw['no_front'])
