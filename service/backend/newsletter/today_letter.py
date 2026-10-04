"""오늘의 한 통 1편 로드.

구독 즉시 환영 발송(handlers/content/subscribe.py)이 사용한다. 조회 실패 시 로컬 미러, MOCK 순으로 폴백한다.
"""
from __future__ import annotations

import logging
from datetime import datetime
from common.dates.validation import KST as _KST
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)


# daily_letters/오프라인 폴백 — today_letters API 응답 shape 준수.
MOCK_LETTER: Dict[str, Any] = {
    "headline": "인하 한 줄 뒤, 변수는 셋입니다",
    "subtitle": "같은 사실을 구조로 분해하면 다음 분기 시점이 보입니다.",
    "body": ["기준금리 3.25→3.00%, 채권금리 0.25%p 하락, 대출금리 즉시 반영.",
             "수출이 부른 회복과 유가가 부른 물가는 한 회로의 두 단자입니다."],
    "key_points": ["기준금리 0.25%p 인하", "채권금리 하방", "대출금리 즉시 반영"],
    "closing_line": "다음 분기 시점은 6월 초입니다.",
}


def kst_today() -> str:
    return datetime.now(_KST).strftime("%Y-%m-%d")


def load_today_letter(date_str: str) -> tuple[Optional[Dict[str, Any]], str]:
    """오늘의 레터 1편 + 소스('dynamodb'|'local'|'mock').

    today_letters API 와 동일 경로(daily_letters_ddb_client.get_daily_letters +
    shape_letter_response)를 재사용 — 발송 내용이 라이브 '오늘의 한 통'과 동일.
    조회 실패/오프라인이면 로컬 미러 → MOCK 순으로 폴백.
    """
    try:
        from clients.ddb import daily_letters as letters_client# noqa: lazy
        from handlers.content.today_letters import shape_letter_response  # noqa: lazy

        rows = letters_client.get_daily_letters(date_str)
        if rows:
            shaped = shape_letter_response(rows[0])
            logger.info('{"event":"letters_loaded","date":"%s","src":"dynamodb"}', date_str)
            return shaped, "dynamodb"
    except Exception as e:
        logger.warning('{"event":"letters_fallback_local","err":"%s"}', type(e).__name__)

    from newsletter.local_letters import load_local_letters  # noqa: lazy

    local = load_local_letters(date_str)
    if local:
        logger.info('{"event":"letters_loaded","date":"%s","src":"local"}', date_str)
        return local, "local"

    return MOCK_LETTER, "mock"
