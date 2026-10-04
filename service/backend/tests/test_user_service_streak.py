"""user_service._calculate_streak 특성화 테스트 — 오늘부터 거꾸로 하루도 안 빠진 연속 일수."""
from datetime import datetime, timedelta

from models.personal import ReadingRecord
from services import user_service as us
from utils.date_validation import KST


def _rec(days_ago: int) -> ReadingRecord:
    d = datetime.now(KST) - timedelta(days=days_ago)
    return ReadingRecord(user_id='u', article_id=f'a{days_ago}', read_at=d.isoformat())


def test_empty_history_is_zero():
    assert us._calculate_streak([]) == 0


def test_not_read_today_breaks_streak():
    assert us._calculate_streak([_rec(1), _rec(2)]) == 0


def test_consecutive_days_from_today():
    assert us._calculate_streak([_rec(0), _rec(1), _rec(2)]) == 3


def test_gap_stops_count_and_duplicates_ignored():
    assert us._calculate_streak([_rec(0), _rec(0), _rec(1), _rec(3)]) == 2


def test_record_without_read_at_is_ignored(monkeypatch):
    r = ReadingRecord(user_id='u', article_id='x', read_at='')
    monkeypatch.setattr(r, 'read_at', '')
    assert us._calculate_streak([r]) == 0
