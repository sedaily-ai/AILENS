"""면 번호(printing_page)가 있는 시기의 "1면이 없는 날" 목록 — 생일 1면 대체(time_machine front 모드)가 쓴다.

목록은 scripts/build_front_page_calendar.py 가 빅카인즈를 날짜별로 한 번씩 세어 만든 정적 JSON 이다.
서버는 이 목록으로 신문이 없는 날(명절·휴간·보관본 누락)을 빅카인즈에 묻지 않고 건너뛰어,
일요일·연휴 생일도 직전 발행일 1면을 조회 한 번으로 찾는다. 목록에 없는 날짜(수집 이후·수집 실패)는
None 을 돌려주고, 호출하는 쪽이 본문 없는 가벼운 조회로 확인한다. 파일이 없거나 깨져도 같은 길로 간다.

파일 형식: {"generated_at": ISO, "covers": [[시작, 끝], ...], "no_front": [날짜...], "unknown": [날짜...]}
  covers   — 날짜별로 확인한 구간(양 끝 포함). 1996-09-29 이후 일요일은 휴간 규칙으로 처리해 세지 않는다.
  no_front — 확인 구간 안에서 1면 기사가 0건인 날
  unknown  — 수집 중 끝내 응답을 받지 못한 날(목록 밖으로 취급)
"""
import json
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import FrozenSet, Optional, Tuple

logger = logging.getLogger(__name__)

CALENDAR_PATH = Path(__file__).with_name('front_page_calendar.json')


@dataclass(frozen=True)
class FrontCalendar:
    ranges: Tuple[Tuple[str, str], ...]
    no_front: FrozenSet[str]
    unknown: FrozenSet[str]

    def known_front(self, date: str) -> Optional[bool]:
        """True 1면 있음, False 1면 없음, None 목록 밖(확인 구간 밖이거나 수집 실패한 날)."""
        if date in self.unknown or not any(start <= date <= end for start, end in self.ranges):
            return None
        return date not in self.no_front


EMPTY_CALENDAR = FrontCalendar((), frozenset(), frozenset())


def _dates(value) -> FrozenSet[str]:
    if not isinstance(value, list) or not all(isinstance(item, str) for item in value):
        raise ValueError('날짜 목록 형식이 아님')
    return frozenset(value)


def load_calendar(path: Path = CALENDAR_PATH) -> FrontCalendar:
    """목록 파일을 읽는다. 없거나 형식이 틀리면 빈 목록(모든 날짜가 목록 밖)."""
    try:
        raw = json.loads(path.read_text(encoding='utf-8'))
        covers = raw['covers']
        if not isinstance(covers, list) or not all(
                isinstance(pair, list) and len(pair) == 2 and all(isinstance(d, str) for d in pair) for pair in covers):
            raise ValueError('covers 형식이 아님')
        return FrontCalendar(tuple((start, end) for start, end in covers),
                             _dates(raw.get('no_front', [])), _dates(raw.get('unknown', [])))
    except FileNotFoundError:
        logger.warning('1면 목록 파일이 없어 모든 날짜를 빅카인즈로 확인합니다')
    except Exception as e:  # noqa: BLE001
        logger.warning('1면 목록 파일을 읽지 못해 모든 날짜를 빅카인즈로 확인합니다: %s', e)
    return EMPTY_CALENDAR


_calendar: Optional[FrontCalendar] = None


def get_calendar() -> FrontCalendar:
    """처음 한 번 읽고 Lambda 컨테이너가 살아 있는 동안 재사용한다."""
    global _calendar
    if _calendar is None:
        _calendar = load_calendar()
    return _calendar
