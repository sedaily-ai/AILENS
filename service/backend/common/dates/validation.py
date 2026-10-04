"""요청 날짜(`YYYY-MM-DD`, KST) 검증 — time_machine / timeline 핸들러 공용.

KST·DATE_FORMAT·_today_kst·_validate_date·BadRequest 를 두 핸들러가 공유한다. 정책: 미래 날짜는 오류가 아니라 오늘로 당긴다(빈 지면 대신 오늘 지면).
"""
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

logger = logging.getLogger(__name__)

KST = timezone(timedelta(hours=9))
DATE_FORMAT = '%Y-%m-%d'


class BadRequest(Exception):
    """400 으로 내려보낼 입력 오류."""


def today_kst() -> str:
    return datetime.now(KST).strftime(DATE_FORMAT)


def validate_date(raw: str, min_date: Optional[str] = None) -> str:
    """`YYYY-MM-DD` 검증 후 정규화된 날짜를 돌려준다.

    - 빈 값/형식 오류 → BadRequest
    - 미래 날짜 → 오늘(KST)로 당김
    - min_date(YYYY-MM-DD) 지정 시 그 이전 날짜 → BadRequest
    """
    if not raw:
        raise BadRequest('date 파라미터가 필요합니다. (YYYY-MM-DD)')
    try:
        parsed = datetime.strptime(raw, DATE_FORMAT)
    except (ValueError, TypeError):
        raise BadRequest(f'날짜 형식이 올바르지 않습니다: {raw} (YYYY-MM-DD 형식으로 입력해주세요)')

    normalized = parsed.strftime(DATE_FORMAT)
    today = today_kst()
    if normalized > today:
        logger.info('미래 날짜 요청(%s) → 오늘(%s)로 조정', normalized, today)
        return today
    if min_date and normalized < min_date:
        raise BadRequest(f'{min_date} 이후 날짜만 지원합니다: {normalized}')
    return normalized
