"""구독자 조회 — PostgreSQL(subscriptions 테이블, lens-cms-api 경유, v1.23).

2026-09-09 이전엔 DynamoDB(sedaily-mbti-newsletter-subscribers-dev)를
직접 스캔했다. `load_active_subscribers()`는 실제로는 어떤 발송
파이프라인도 호출하지 않는 사실상 죽은 코드다(Editor Pick 자동생성
파이프라인이 2026-08-05 폐기된 이후 — subscribe.py의 가입 즉시 환영
발송은 이 함수를 안 거치고 newsletter.sender.send()를 개별 호출한다).
호출자가 생기면 새 저장소를 보도록 여기도 같이 옮겨뒀다.

스키마: email · status(active|suppressed|unsub) · consent(bool)
       · unsubscribe_token · name(optional)

MBTI 페르소나 폐기(2026-08)로 신규 구독자는 mbti_group 을 쓰거나 읽지 않는다.

서버 접근 실패 → MOCK_SUBSCRIBERS 폴백 (Phase 1 오프라인 검증용).
발송 자격: status==active AND consent==True 만.
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List

from clients.newsletter_subscribers_pg_client import list_active_subscribers

logger = logging.getLogger(__name__)

# Phase 1 mock — 실 서버 접근 실패 시 dry-run 검증용. 검증된 테스트 주소만 둘 것.
MOCK_SUBSCRIBERS: List[Dict[str, Any]] = [
    {"email": "seunghow@gmail.com", "status": "active",
     "consent": True, "unsubscribe_token": "mock-tok-1", "name": "테스트"},
]


def _eligible(s: Dict[str, Any]) -> bool:
    return s.get("status") == "active" and bool(s.get("consent")) and bool(s.get("email"))


def load_active_subscribers(use_mock: bool = False) -> List[Dict[str, Any]]:
    """발송 자격 구독자 목록. use_mock 또는 서버 접근 실패 시 MOCK 반환."""
    if use_mock:
        logger.info('{"event":"subscribers_mock","n":%d}', len(MOCK_SUBSCRIBERS))
        return [s for s in MOCK_SUBSCRIBERS if _eligible(s)]
    try:
        items = list_active_subscribers()
        eligible = [s for s in items if _eligible(s)]
        logger.info('{"event":"subscribers_loaded","scanned":%d,"eligible":%d}',
                    len(items), len(eligible))
        return eligible
    except Exception as e:  # 서버 접근 실패 → mock 폴백 (Phase 1)
        logger.warning('{"event":"subscribers_fallback_mock","err":"%s"}',
                        type(e).__name__)
        return [s for s in MOCK_SUBSCRIBERS if _eligible(s)]
