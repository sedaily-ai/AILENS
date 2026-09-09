"""뉴스레터 구독자 — 공개 구독/해지 + admin 통계 조회 (v1.23).

원본 DynamoDB(sedaily-mbti-newsletter-subscribers-dev)는 단일 평면
테이블(뉴스레터 지면 구분 없음)이었다 — v1.9에서 이미 3명을
newsletter_id=1("지면 1면")에 임시 배정했고(실제 지면별 발송 로직이
아직 없어서, docs/architecture/db-changelog/postgres/v1.9 참조), 이
쓰기 경로도 같은 임시 배정을 그대로 따른다. 진짜 지면별 구독 분리는
지면별 발송 기능이 실제로 생길 때 재설계할 별도 과제.

원본 스키마(subscriptions)에 없던 필드(consent/status 3단계/name/
onboarding_*)는 v1.23에서 추가했다 — status/consent는 발송 대상 필터링에
직접 쓰여 실제 컬럼으로, name/onboarding_format/onboarding_interests는
extra JSONB로.
"""
from __future__ import annotations

import json
import uuid
from typing import Any, Dict, List, Optional

from db import get_cursor

_DEFAULT_NEWSLETTER_ID = 1


def subscribe(email: str, consent: bool, name: Optional[str] = None,
              onboarding_format: Optional[str] = None,
              onboarding_interests: Optional[List[str]] = None,
              newsletter_id: int = _DEFAULT_NEWSLETTER_ID) -> Dict[str, Any]:
    """이메일 기준 upsert — 이미 구독 이력이 있으면 unsubscribe_token/
    started_at은 보존하고 consent/status만 활성화, 없으면 새로 만든다
    (DynamoDB put_item 전체 교체와 달리 이력 필드를 명시적으로 보존)."""
    with get_cursor() as cur:
        cur.execute(
            "SELECT id, unsubscribe_token, extra FROM subscriptions WHERE newsletter_id=%s AND email=%s",
            (newsletter_id, email),
        )
        existing = cur.fetchone()
        extra = dict(existing["extra"]) if existing else {}
        if name is not None:
            extra["name"] = name
        if onboarding_format is not None:
            extra["onboarding_format"] = onboarding_format
        if onboarding_interests is not None:
            extra["onboarding_interests"] = onboarding_interests

        if existing:
            cur.execute(
                "UPDATE subscriptions SET consent=%s, status='active', cancelled_at=NULL, extra=%s WHERE id=%s",
                (consent, json.dumps(extra), existing["id"]),
            )
            token = existing["unsubscribe_token"]
        else:
            token = str(uuid.uuid4())
            cur.execute(
                "INSERT INTO subscriptions "
                "(newsletter_id, email, unsubscribe_token, consent, status, extra) "
                "VALUES (%s,%s,%s,%s,'active',%s)",
                (newsletter_id, email, token, consent, json.dumps(extra)),
            )
    result = get_by_email(email, newsletter_id)
    result["resubscribed"] = bool(existing)
    return result


def get_by_email(email: str, newsletter_id: int = _DEFAULT_NEWSLETTER_ID) -> Optional[Dict[str, Any]]:
    with get_cursor() as cur:
        cur.execute(
            "SELECT * FROM subscriptions WHERE newsletter_id=%s AND email=%s",
            (newsletter_id, email),
        )
        row = cur.fetchone()
        return _to_dict(row) if row else None


def unsubscribe_by_token(token: str) -> bool:
    """토큰은 UNIQUE라 지면 구분 없이 전역으로 찾는다(원본 DynamoDB의
    scan-by-token과 동일한 동작, 인덱스로 대체)."""
    with get_cursor() as cur:
        cur.execute(
            "UPDATE subscriptions SET status='unsub', cancelled_at=now() "
            "WHERE unsubscribe_token=%s AND cancelled_at IS NULL RETURNING id",
            (token,),
        )
        return cur.fetchone() is not None


def list_active_subscribers(newsletter_id: int = _DEFAULT_NEWSLETTER_ID) -> List[Dict[str, Any]]:
    """발송 파이프라인 전용 — status=active AND consent=TRUE만."""
    with get_cursor() as cur:
        cur.execute(
            "SELECT * FROM subscriptions WHERE newsletter_id=%s AND status='active' AND consent=TRUE",
            (newsletter_id,),
        )
        return [_to_dict(r) for r in cur.fetchall()]


def list_all() -> List[Dict[str, Any]]:
    """admin 통계 전용 — 전체(지면 무관)."""
    with get_cursor() as cur:
        cur.execute("SELECT * FROM subscriptions ORDER BY started_at DESC")
        return [_to_dict(r) for r in cur.fetchall()]


def _to_dict(row: Dict[str, Any]) -> Dict[str, Any]:
    extra = row.get("extra") or {}
    return {
        "email": row["email"],
        "status": row["status"],
        "consent": row["consent"],
        "unsubscribe_token": row["unsubscribe_token"],
        "name": extra.get("name"),
        "onboarding_format": extra.get("onboarding_format"),
        "onboarding_interests": extra.get("onboarding_interests"),
        "created_at": row["started_at"].isoformat() if row.get("started_at") else None,
        "cancelled_at": row["cancelled_at"].isoformat() if row.get("cancelled_at") else None,
    }
