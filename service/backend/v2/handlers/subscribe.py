"""구독 수집 API — newsletter 회원 자동 적재.

라우팅(같은 Lambda):
  POST /api/v2/subscribe     body {email, mbti_group, consent[, name]}
       → sedaily-mbti-newsletter-subscribers-dev 에 active 구독자 upsert
  GET  /api/v2/unsubscribe?token=...   → 해당 구독자 status=unsub (1클릭, 법적 필수)

consent=true 강제(CAN-SPAM). 재구독 시 idempotent upsert.
Auth: NONE (v1 parity, 민감정보 없음 — 이메일+그룹만).
"""
from __future__ import annotations

import json
import logging
import os
import re
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, Tuple

from config.constants import CORS_HEADERS
from core.decorators import lambda_handler as handler_decorator
from core.response import error_response, success_response

logger = logging.getLogger(__name__)
logging.getLogger().setLevel(logging.INFO)

SUBSCRIBERS_TABLE = os.environ.get("SUBSCRIBERS_TABLE", "sedaily-mbti-newsletter-subscribers-dev")
_GROUPS = {"NT", "NF", "ST", "SF"}
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _table():
    import boto3  # lazy

    return boto3.resource("dynamodb").Table(SUBSCRIBERS_TABLE)


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
        tbl = _table()
        # Phase B: 토큰 인덱스 미설치 — scan 필터(저volume 허용, 추후 GSI 최적화)
        resp = tbl.scan(FilterExpression="unsubscribe_token = :t",
                        ExpressionAttributeValues={":t": token})
        items = resp.get("Items", [])
        if not items:
            return error_response("invalid token", status_code=404, code="NOT_FOUND")
        email = items[0]["email"]
        tbl.update_item(Key={"email": email},
                        UpdateExpression="SET #st = :u",
                        ExpressionAttributeNames={"#st": "status"},
                        ExpressionAttributeValues={":u": "unsub"})
        logger.info('{"event":"unsubscribed","email_hash":"%s"}', hash(email))
        return success_response({"ok": True, "unsubscribed": True})

    # ── 구독 ────────────────────────────────────
    email = (body.get("email") or "").strip().lower()
    group = (body.get("mbti_group") or "").strip().upper()
    consent = bool(body.get("consent"))
    name = (body.get("name") or "").strip()[:40]

    if not _EMAIL_RE.match(email):
        return error_response("invalid email", status_code=400, code="VALIDATION")
    if group not in _GROUPS:
        return error_response("mbti_group must be NT|NF|ST|SF", status_code=400, code="VALIDATION")
    if not consent:
        return error_response("consent required", status_code=400, code="CONSENT_REQUIRED")

    now = datetime.now(timezone.utc).isoformat()
    tbl = _table()
    existing = tbl.get_item(Key={"email": email}).get("Item")
    token = (existing or {}).get("unsubscribe_token") or uuid.uuid4().hex
    tbl.put_item(Item={
        "email": email, "mbti_group": group, "status": "active",
        "consent": True, "unsubscribe_token": token, "name": name,
        "created_at": (existing or {}).get("created_at") or now,
        "updated_at": now,
    })
    logger.info('{"event":"subscribed","group":"%s","resub":%s}',
                group, json.dumps(bool(existing)))

    # 구독 즉시 — 해당 그룹 당일 레터를 그 이메일로 발송 (환영 발송).
    send_status = _send_today_letter(email, group, token)

    return success_response({
        "ok": True,
        "resubscribed": bool(existing),
        "welcome_sent": send_status in ("sent", "dry_run"),
        "send_status": send_status,
    })


_BASE = "https://ailens.sedaily.ai"


def _send_today_letter(email: str, group: str, token: str) -> str:
    """가입 즉시 당일 그룹 레터 발송. 발송 실패해도 구독은 유지(상태만 반환)."""
    try:
        from v2.handlers.newsletter import _load_today_letters, _kst_today  # noqa: lazy
        from v2.newsletter.render import render_html, subject  # noqa: lazy
        from v2.newsletter.sender import send  # noqa: lazy

        date_str = _kst_today()
        letters, src = _load_today_letters(date_str)
        letter = letters.get(group)
        if not letter:
            logger.warning('{"event":"welcome_no_letter","group":"%s","src":"%s"}', group, src)
            return "no_letter"
        unsub = f"{_BASE}/unsubscribe?token={token}"
        res = send(email, subject(letter, date_str), render_html(letter, {"unsubscribe_token": token}, date_str), unsub)
        st = res.get("status", "error")
        logger.info('{"event":"welcome_send","group":"%s","src":"%s","status":"%s"}', group, src, st)
        return st
    except Exception as e:
        logger.warning('{"event":"welcome_send_error","err":"%s"}', type(e).__name__)
        return "error"
