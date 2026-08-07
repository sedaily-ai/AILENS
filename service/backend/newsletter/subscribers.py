"""구독자 조회 — DynamoDB `sedaily-mbti-newsletter-subscribers-dev`.

스키마: PK email(S) · status(S active|suppressed|unsub) · consent(BOOL)
       · unsubscribe_token(S) · name(S, optional)

MBTI 페르소나 폐기(2026-08)로 신규 구독자는 mbti_group 을 쓰거나 읽지 않는다.
기존 저장분에 남아있는 mbti_group 값은 그대로 두되(마이그레이션 없음),
이 모듈은 더 이상 그 값을 참조하지 않는다.

테이블 미존재/권한없음/dry → MOCK_SUBSCRIBERS 폴백 (Phase 1 오프라인 검증용).
발송 자격: status==active AND consent==True 만.
"""
from __future__ import annotations

import logging
import os
from typing import Any, Dict, List

logger = logging.getLogger(__name__)

SUBSCRIBERS_TABLE = os.environ.get("SUBSCRIBERS_TABLE", "sedaily-mbti-newsletter-subscribers-dev")

# Phase 1 mock — 실 테이블 생성/연결 전 dry-run 검증용. 검증된 테스트 주소만 둘 것.
MOCK_SUBSCRIBERS: List[Dict[str, Any]] = [
    {"email": "seunghow@gmail.com", "status": "active",
     "consent": True, "unsubscribe_token": "mock-tok-1", "name": "테스트"},
]


def _eligible(s: Dict[str, Any]) -> bool:
    return s.get("status") == "active" and bool(s.get("consent")) and bool(s.get("email"))


def load_active_subscribers(use_mock: bool = False) -> List[Dict[str, Any]]:
    """발송 자격 구독자 목록. use_mock 또는 테이블 접근 실패 시 MOCK 반환."""
    if use_mock:
        logger.info('{"event":"subscribers_mock","n":%d}', len(MOCK_SUBSCRIBERS))
        return [s for s in MOCK_SUBSCRIBERS if _eligible(s)]
    try:
        import boto3  # noqa: lazy

        tbl = boto3.resource("dynamodb").Table(SUBSCRIBERS_TABLE)
        items: List[Dict[str, Any]] = []
        kwargs: Dict[str, Any] = {
            "FilterExpression": "#st = :a AND consent = :c",
            "ExpressionAttributeNames": {"#st": "status"},
            "ExpressionAttributeValues": {":a": "active", ":c": True},
        }
        while True:
            resp = tbl.scan(**kwargs)
            items.extend(resp.get("Items", []))
            lek = resp.get("LastEvaluatedKey")
            if not lek:
                break
            kwargs["ExclusiveStartKey"] = lek
        eligible = [s for s in items if _eligible(s)]
        logger.info('{"event":"subscribers_loaded","scanned":%d,"eligible":%d}',
                    len(items), len(eligible))
        return eligible
    except Exception as e:  # 테이블 미존재/권한 → mock 폴백 (Phase 1)
        logger.warning('{"event":"subscribers_fallback_mock","err":"%s"}',
                        type(e).__name__)
        return [s for s in MOCK_SUBSCRIBERS if _eligible(s)]
