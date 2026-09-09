"""구독 수집 API — newsletter 회원 자동 적재.

라우팅(같은 Lambda):
  POST /api/v2/subscribe     body {email, consent[, name][, format][, interests][, letter]}
       → PostgreSQL(subscriptions 테이블, lens-cms-api 경유)에 active 구독자 upsert
  GET  /api/v2/unsubscribe?token=...   → 해당 구독자 status=unsub (1클릭, 법적 필수)

2026-09-09(v1.23) — 저장을 DynamoDB(sedaily-mbti-newsletter-subscribers-dev)
에서 PostgreSQL로 이관. 검증·CAN-SPAM consent 체크·SES 발송 로직은
이 파일에 그대로 남고, 저장만 clients/newsletter_subscribers_pg_client.py
(lens-cms-api HTTP 호출)로 위임한다.

consent=true 강제(CAN-SPAM). 재구독 시 idempotent upsert.
Auth: NONE (v1 parity, 민감정보 없음 — 이메일만).

2026-08: MBTI 페르소나 개념 폐기로 구독 시 그룹 선택을 받지 않는다 — 모든
구독자가 동일한 '오늘의 한 통'을 받는다. 기존 저장분에 남아있는 mbti_group
값은 그대로 두되(마이그레이션 없음), 신규/재구독 upsert 는 더 이상 이 필드를
쓰지 않는다.

2026-09-04 — 리팩토링 감사로 발견: 이 파일과 별개로
`handlers/newsletter/subscribe.py`(`POST /api/newsletter/subscribe`, 별도
Lambda `sedaily-mbti-newsletter-subscribe-dev`)가 완전히 독립적으로
같은 테이블에 구독자를 upsert하는 두 번째 구현으로 존재했다 — 토큰 생성
방식이 다르고(uuid4 vs secrets.token_urlsafe), 이메일 템플릿을 따로
인라인 구현했고, unsubscribe 엔드포인트가 아예 없었고, 결정적으로 테이블명
환경변수 이름이 달라서(`SUBSCRIBERS_TABLE` vs
`NEWSLETTER_SUBSCRIBERS_TABLE`) 운영 중 테이블을 옮기면 admin 통계
대시보드만 조용히 옛 테이블을 계속 보는 위험이 있었다. 이 파일이 정본으로
남고(unsubscribe가 있고 공용 newsletter/render.py·sender.py를 재사용해
아키텍처가 더 나음), 저쪽만 갖고 있던 두 기능(`format`/`interests` 온보딩
개인화값 캡처, 특정 `letter` 즉시 발송)을 이식해 통합했다.
`handlers/newsletter/subscribe.py`는 삭제됨 — 배포된 Lambda 함수
(`sedaily-mbti-newsletter-subscribe-dev`)와 API Gateway 라우트 자체는
이번 정리 범위 밖(AWS 자원 삭제는 별도 확인 필요)이라 아직 남아있을 수
있음.
"""
from __future__ import annotations

import json
import logging
import re
from datetime import datetime, timezone
from typing import Any, Dict, Tuple

from clients import newsletter_subscribers_pg_client as subscribers_client
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

    # 온보딩(/start) 개인화값 — 둘 다 선택. 잘못된 타입이 오면 그냥 무시
    # (구독 자체가 이 값들보다 중요하다 — newsletter/subscribe.py에서 이식,
    # 발행 로직엔 아직 반영 안 됨, 지금은 기록만).
    raw_format = body.get("format")
    req_format = raw_format.strip() if isinstance(raw_format, str) and raw_format.strip() else None
    raw_interests = body.get("interests")
    req_interests = (
        [i.strip() for i in raw_interests if isinstance(i, str) and i.strip()]
        if isinstance(raw_interests, list) else None
    ) or None

    # subscribers_client.subscribe()가 upsert(기존 토큰/온보딩값 보존)를
    # 서버 쪽에서 전담한다 — 이 값이 없으면(None) 서버가 기존 저장분을
    # 그대로 이어받으므로 재구독 시 이전 온보딩 선택이 지워지지 않는다.
    subscriber = subscribers_client.subscribe(
        email, True, name=name or None,
        onboarding_format=req_format, onboarding_interests=req_interests,
    )
    existing = subscriber.get("resubscribed")
    token = subscriber["unsubscribe_token"]
    logger.info('{"event":"subscribed","resub":%s}', json.dumps(bool(existing)))

    # 구독 즉시 발송 — 요청에 특정 letter가 실려 있으면 그걸(예: 방금 보던
    # 페이지), 없으면 오늘의 한 통을 환영 발송(newsletter/subscribe.py에서
    # 이식 — NewsletterCTA.tsx가 지금 보고 있는 레터를 함께 보낼 때 씀).
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
    """가입 즉시 오늘의 한 통 발송. 발송 실패해도 구독은 유지(상태만 반환).

    2026-09-04 — `handlers.newsletter`(그런 모듈 없음, `handlers/newsletter/`는
    패키지일 뿐)에서 import하던 게 실은 이미 삭제된 `handlers/newsletter.py`
    파일을 가리키고 있어 계속 ImportError → 무음 실패였다(newsletter/
    today_letter.py 상단 주석에 경위 기록). 살아있는 위치로 교체."""
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
    """구독 시점에 화면에 떠 있던 특정 레터를 그대로 발송(newsletter/subscribe.py에서
    이식) — `_send_today_letter`와 달리 DB 조회 없이 프런트가 넘긴 페이로드를
    그대로 쓴다. render_html()이 기대하는 필드(headline/subtitle/body[]/
    key_points[]/closing_line)만 추리고, editor_name/editor_role/accent는
    무시한다(단일 명의 체계라 render_html이 항상 고정값을 씀 — 2026-08 결정과
    동일). 발송 실패해도 구독은 유지(상태만 반환)."""
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
