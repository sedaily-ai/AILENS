"""뉴스레터 발송 Lambda — 일 1회 cron (Phase 1).

Trigger(예정): EventBridge ``sedaily-mbti-v2-newsletter-schedule`` (KST 07:00).
파이프라인:
  1. 오늘 daily_letters 1편 로드. 실패/없음 → MOCK 폴백.
  2. 발송 자격 구독자 로드 (status=active & consent=true). 테이블 없으면 MOCK.
  3. 모든 구독자에게 같은 레터 HTML 렌더 → SES 발송(기본 dry-run).
  4. 건별 실패 격리, JSON 로그, 요약 반환.

안전: NEWSLETTER_DRY_RUN!=0 (기본) → SES 미호출. 실발송은 SES 프로덕션
액세스 + 발신 DKIM 검증 + DRY_RUN=0 모두 충족 시에만. (docs/product/newsletter-ses-plan.md)

리소스 미생성 상태에서도 dry-run 동작(전부 mock 폴백) — Phase 1 검증용.

2026-08: MBTI 페르소나 개념 폐기로 그룹별(NT/NF/ST/SF) 4편 발송 대신 모든
구독자에게 동일한 레터 1편을 보낸다.
"""
from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, Optional

from core.decorators import lambda_handler as handler_decorator
from core.response import success_response

from newsletter.render import render_html, subject
from newsletter.sender import send
from newsletter.subscribers import load_active_subscribers

logger = logging.getLogger(__name__)
logging.getLogger().setLevel(logging.INFO)

_KST = timezone(timedelta(hours=9))
_BASE = "https://ailens.sedaily.ai"

# Phase 1 mock — daily_letters 미연결/없음 폴백. today_letters 응답 shape 준수.
MOCK_LETTER: Dict[str, Any] = {
    "headline": "인하 한 줄 뒤, 변수는 셋입니다",
    "subtitle": "같은 사실을 구조로 분해하면 다음 분기 시점이 보입니다.",
    "body": ["기준금리 3.25→3.00%, 채권금리 0.25%p 하락, 대출금리 즉시 반영.",
             "수출이 부른 회복과 유가가 부른 물가는 한 회로의 두 단자입니다."],
    "key_points": ["기준금리 0.25%p 인하", "채권금리 하방", "대출금리 즉시 반영"],
    "closing_line": "다음 분기 시점은 6월 초입니다.",
}


def _kst_today() -> str:
    return datetime.now(_KST).strftime("%Y-%m-%d")


def _load_today_letters(date_str: str) -> tuple[Optional[Dict[str, Any]], str]:
    """오늘의 레터 1편 + 소스('dynamodb'|'local'|'mock').

    today_letters API 와 동일 경로(daily_letters_ddb_client.get_daily_letters +
    shape_letter_response)를 재사용 — 발송 내용이 라이브 '오늘의 한 통'과 동일.
    (2026-08-05: pgvector RDS 삭제로 죽어 있던 1순위 경로를 실제 라이브 소스인
    DynamoDB로 교체 — 이전에는 이 시도가 항상 실패해 매번 local/mock으로
    폴백하고 있었다.) 조회 실패/오프라인이면 MOCK 폴백.
    """
    try:
        from clients import daily_letters_ddb_client as letters_client  # noqa: lazy
        from handlers.today_letters import shape_letter_response  # noqa: lazy

        rows = letters_client.get_daily_letters(date_str)
        if rows:
            shaped = shape_letter_response(rows[0])
            logger.info('{"event":"letters_loaded","date":"%s","src":"dynamodb"}', date_str)
            return shaped, "dynamodb"
    except Exception as e:
        logger.warning('{"event":"letters_fallback_local","err":"%s"}', type(e).__name__)

    # pgvector 미적재/불완전 → 로컬 미러 폴백 (사이트의 '오늘의 한 통'과 동일 내용)
    from newsletter.local_letters import load_local_letters  # noqa: lazy

    local = load_local_letters(date_str)
    if local:
        logger.info('{"event":"letters_loaded","date":"%s","src":"local"}', date_str)
        return local, "local"

    return MOCK_LETTER, "mock"


@handler_decorator
async def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    use_mock = os.environ.get("NEWSLETTER_FORCE_MOCK", "0") == "1"
    date_str = _kst_today()
    letter, letters_source = _load_today_letters(date_str)
    subs = load_active_subscribers(use_mock=use_mock)

    sent = 0
    skipped = 0
    errors = 0
    if not letter:
        skipped = len(subs)
        logger.warning('{"event":"newsletter_skip_no_letter","date":"%s"}', date_str)
    else:
        for s in subs:
            unsub = f"{_BASE}/unsubscribe?token={s.get('unsubscribe_token','')}"
            res = send(s["email"], subject(letter, date_str),
                       render_html(letter, s, date_str), unsub)
            st = res.get("status")
            if st in ("sent", "dry_run"):
                sent += 1
            else:
                errors += 1

    summary = {"date": date_str, "subscribers": len(subs), "sent": sent,
               "skipped": skipped, "errors": errors,
               "dry_run": os.environ.get("NEWSLETTER_DRY_RUN", "1") != "0",
               "letters_source": letters_source}
    logger.info('{"event":"newsletter_run_complete","summary":%s}',
                json.dumps(summary, ensure_ascii=False))
    return success_response(summary)
