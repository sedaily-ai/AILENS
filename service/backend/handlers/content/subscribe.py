"""구독 수집 API — newsletter 회원 자동 적재.

라우팅(같은 Lambda):
  POST /api/v2/subscribe     body {email, consent[, name][, format][, interests][, letter]}
       → PostgreSQL(subscriptions 테이블, lens-cms-api 경유)에 active 구독자 upsert
  GET  /api/v2/unsubscribe?token=...   → 해당 구독자 status=unsub (1클릭, 법적 필수)

저장은 lens-cms-api(PostgreSQL subscriptions 테이블) 호출을 통해
clients/pg/newsletter_subscribers.py 에 위임한다. 이 파일은 검증, CAN-SPAM consent 확인,
SES 발송을 담당한다.

consent=true 를 강제하며(CAN-SPAM) 재구독은 idempotent upsert 로 처리한다.
Auth: NONE (이메일만 수집하며 민감정보 없음).

MBTI 그룹 선택은 받지 않는다. 모든 구독자가 동일한 '오늘의 한 통'을 받으며,
기존 저장분의 mbti_group 값은 보존하되 upsert 시 갱신하지 않는다.
"""
from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timezone
from typing import Any, Dict, Tuple

from clients.pg import newsletter_subscribers as subscribers_client
from common.constants import SITE_URL
from config.constants import CORS_HEADERS
from core.decorators import lambda_handler as handler_decorator
from core.response import error_response, success_response

logger = logging.getLogger(__name__)
logging.getLogger().setLevel(logging.INFO)

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _parse(event: Dict[str, Any]) -> Tuple[str, str, Dict[str, Any], Dict[str, str]]:
    method = (event.get("httpMethod")
              or (event.get("requestContext") or {}).get("http", {}).get("method") or "GET")
    path = (event.get("rawPath") or event.get("path") or "")
    body: Dict[str, Any] = {}
    raw = event.get("body")
    if raw:
        try:
            body = json.loads(raw)
        except (TypeError, ValueError):
            body = {}
    qs = event.get("queryStringParameters") or {}
    return method, path, body, qs


@handler_decorator
async def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    method, path, body, qs = _parse(event)
    if method == "OPTIONS":
        return {"statusCode": 200, "headers": CORS_HEADERS, "body": ""}

    # ── 수신거부 ────────────────────────────────
    if method == "GET" or path.endswith("/unsubscribe"):
        token = (qs.get("token") or "").strip()
        if not token:
            return error_response("token required", status_code=400, code="VALIDATION")
        if not subscribers_client.unsubscribe_by_token(token):
            return error_response("invalid token", status_code=404, code="NOT_FOUND")
        logger.info('{"event":"unsubscribed"}')
        return success_response({"ok": True, "unsubscribed": True})

    # ── 구독 ────────────────────────────────────
    email = (body.get("email") or "").strip().lower()
    consent = bool(body.get("consent"))
    name = (body.get("name") or "").strip()[:40]

    if not _EMAIL_RE.match(email):
        return error_response("invalid email", status_code=400, code="VALIDATION")
    if not consent:
        return error_response("consent required", status_code=400, code="CONSENT_REQUIRED")

    # 온보딩(/start) 개인화값(선택). 타입이 잘못되면 무시하며, 현재는 저장만 하고 발행에는 반영하지 않는다.
    raw_format = body.get("format")
    req_format = raw_format.strip() if isinstance(raw_format, str) and raw_format.strip() else None
    raw_interests = body.get("interests")
    req_interests = (
        [i.strip() for i in raw_interests if isinstance(i, str) and i.strip()]
        if isinstance(raw_interests, list) else None
    ) or None

    # upsert 는 서버가 처리하며 기존 토큰·온보딩값을 보존한다. 값이 None 이면 기존 저장분이 유지된다.
    subscriber = subscribers_client.subscribe(
        email, True, name=name or None,
        onboarding_format=req_format, onboarding_interests=req_interests,
    )
    existing = subscriber.get("resubscribed")
    token = subscriber["unsubscribe_token"]
    logger.info('{"event":"subscribed","resub":%s}', json.dumps(bool(existing)))

    # 구독 즉시 환영 발송. 요청에 letter 가 있으면 해당 레터를, 없으면 오늘의 한 통을 보낸다.
    letter_payload = body.get("letter")
    if isinstance(letter_payload, dict) and letter_payload.get("headline"):
        send_status = _send_specific_letter(email, token, letter_payload)
    else:
        send_status = _send_today_letter(email, token)

    return success_response({
        "ok": True,
        "resubscribed": bool(existing),
        "welcome_sent": send_status in ("sent", "dry_run"),
        "send_status": send_status,
    })


_BASE = SITE_URL


def _send_today_letter(email: str, token: str) -> str:
    """가입 즉시 오늘의 한 통을 발송한다. 발송에 실패해도 구독은 유지하며 상태만 반환한다."""
    try:
        from newsletter.today_letter import load_today_letter, kst_today  # noqa: lazy
        from newsletter.render import render_html, subject  # noqa: lazy
        from newsletter.sender import send  # noqa: lazy

        date_str = kst_today()
        letter, src = load_today_letter(date_str)
        if not letter:
            logger.warning('{"event":"welcome_no_letter","src":"%s"}', src)
            return "no_letter"
        unsub = f"{_BASE}/unsubscribe?token={token}"
        res = send(email, subject(letter, date_str), render_html(letter, {"unsubscribe_token": token}, date_str), unsub)
        st = res.get("status", "error")
        logger.info('{"event":"welcome_send","src":"%s","status":"%s"}', src, st)
        return st
    except Exception as e:
        logger.warning('{"event":"welcome_send_error","err":"%s"}', type(e).__name__)
        return "error"


def _send_specific_letter(email: str, token: str, payload: Dict[str, Any]) -> str:
    """구독 시점에 화면에 표시된 특정 레터를 발송한다.

    `_send_today_letter` 와 달리 DB 조회 없이 프런트가 전달한 페이로드를 사용한다.
    render_html() 이 요구하는 필드(headline/subtitle/body[]/key_points[]/closing_line)만
    추리고 editor_name/editor_role/accent 는 무시한다. 발송에 실패해도 구독은 유지한다.
    """
    try:
        from newsletter.render import render_html, subject  # noqa: lazy
        from newsletter.sender import send  # noqa: lazy

        date_str = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        letter = {
            "headline": payload.get("headline") or "",
            "subtitle": payload.get("subtitle") or "",
            "body": [b for b in (payload.get("body") or []) if isinstance(b, str)],
            "key_points": [k for k in (payload.get("key_points") or []) if isinstance(k, str)],
            "closing_line": payload.get("closing_line"),
        }
        unsub = f"{_BASE}/unsubscribe?token={token}"
        res = send(email, subject(letter, date_str), render_html(letter, {"unsubscribe_token": token}, date_str), unsub)
        st = res.get("status", "error")
        logger.info('{"event":"welcome_send_specific","status":"%s"}', st)
        return st
    except Exception as e:
        logger.warning('{"event":"welcome_send_specific_error","err":"%s"}', type(e).__name__)
        return "error"
