"""오늘의 한 통 1편 로드 — 구독 즉시 환영 발송(handlers/subscribe.py)이 쓴다.

2026-09-04 — 리팩토링 감사로 발견: 원래 `handlers/newsletter.py`(일 1회 cron
발송 Lambda, Phase 1)에 있던 헬퍼였는데, `tests/test_newsletter.py`(1-6행)가
이미 기록해뒀듯 그 모듈 경로(`handlers.newsletter`)는 나중에 생긴 동명의
패키지 `handlers/newsletter/`(newsletter/subscribe.py를 담던 곳)에 항상
가려져 자기 경로로는 영원히 도달 불가능한 상태였다 — 그래서 2026-08-24
"Tier A 죽은 코드 정리"(커밋 732b3cf)가 파일을 지웠다. 문제는
`handlers/subscribe.py`가 `from handlers.newsletter import _load_today_letters,
_kst_today`로 이 함수들을 **런타임에 지연 import**해 계속 쓰고 있었다는 것 —
파일이 있든 없든 그 경로는 패키지에 가려져 있어 이 import는 파일 삭제 이전
부터(패키지가 생긴 시점부터) 이미 실패하고 있었다. grep 기반 죽은 코드
판단이 이런 지연 import(try/except 안, 최상단 import가 아님)를 놓치기 쉽다는
걸 보여주는 실제 사례. 그 결과 구독 시 "오늘의 한 통" 환영 발송이
ImportError → 무음 except → `send_status="error"`로 계속 실패해왔다(예외를
삼키는 코드라 에러 로그 외엔 티가 안 났다).

`handlers/newsletter.py`를 통째로 되살리는 대신(그 cron 발송 로직 자체는
정말 죽어있다 — 폐기된 Lambda 전용), 지금도 실제로 쓰이는 이 두 함수만
`newsletter/`(공용 뉴스레터 모듈 위치, render.py·sender.py·subscribers.py와
같은 자리)로 옮겨 재발을 막는다.
"""
from __future__ import annotations

import logging
from datetime import datetime
from utils.date_validation import KST as _KST
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
        from handlers.today_letters import shape_letter_response  # noqa: lazy

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
