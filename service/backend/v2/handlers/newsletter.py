"""뉴스레터 발송 Lambda — 일 1회 cron (Phase 1).

Trigger(예정): EventBridge ``sedaily-mbti-v2-newsletter-schedule`` (KST 07:00).
파이프라인:
  1. 오늘 daily_letters 4편 로드 (NT/NF/ST/SF). 실패/없음 → MOCK 폴백.
  2. 발송 자격 구독자 로드 (status=active & consent=true). 테이블 없으면 MOCK.
  3. 구독자별 → 자기 그룹 레터 HTML 렌더 → SES 발송(기본 dry-run).
  4. 건별 실패 격리, JSON 로그, 요약 반환.

안전: NEWSLETTER_DRY_RUN!=0 (기본) → SES 미호출. 실발송은 SES 프로덕션
액세스 + 발신 DKIM 검증 + DRY_RUN=0 모두 충족 시에만. (docs/product/newsletter-ses-plan.md)

리소스 미생성 상태에서도 dry-run 동작(전부 mock 폴백) — Phase 1 검증용.
"""
from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from core.decorators import lambda_handler as handler_decorator
from core.response import success_response

from v2.newsletter.render import render_html, subject
from v2.newsletter.sender import send
from v2.newsletter.subscribers import load_active_subscribers

logger = logging.getLogger(__name__)
logging.getLogger().setLevel(logging.INFO)

_KST = timezone(timedelta(hours=9))
_BASE = "https://ailens.sedaily.ai"

# Phase 1 mock — daily_letters 미연결/없음 폴백. today_letters 응답 shape 준수.
MOCK_LETTERS: List[Dict[str, Any]] = [
    {"mbti_group": "NT", "headline": "인하 한 줄 뒤, 변수는 셋입니다",
     "subtitle": "같은 사실을 구조로 분해하면 다음 분기 시점이 보입니다.",
     "body": ["기준금리 3.25→3.00%, 채권금리 0.25%p 하락, 대출금리 즉시 반영.",
              "수출이 부른 회복과 유가가 부른 물가는 한 회로의 두 단자입니다."],
     "key_points": ["기준금리 0.25%p 인하", "채권금리 하방", "대출금리 즉시 반영"],
     "closing_line": "다음 분기 시점은 6월 초입니다."},
    {"mbti_group": "NF", "headline": "0.25%p가 누군가의 한숨을 풀어준 날",
     "subtitle": "숫자 한 줄이 내 집 마련 꿈에 닿는 거리에 대해.",
     "body": ["금리 인하 소식에 청년 대출자 김씨의 한 달 이자 부담이 조금 줄었습니다."],
     "key_points": [], "closing_line": "회복은 평균의 언어, 체감은 가계의 언어입니다."},
    {"mbti_group": "ST", "headline": "지금 확인할 4가지",
     "subtitle": "결론부터, 오늘 바로 할 수 있는 것만.",
     "body": ["내 대출 금리·변동고정 비교·중도상환·재약정 시점을 점검하세요."],
     "key_points": ["대출 금리 확인", "변동·고정 비교", "재약정 시점"],
     "closing_line": "캘린더에 적을 날짜는 셋입니다."},
    {"mbti_group": "SF", "headline": "0.25%p 내렸대 — 30초 요약",
     "subtitle": "친구한테 한 줄로 보내면 이거예요.",
     "body": ["대출 부담 살짝 줄고, 시장은 환영하는 분위기. 가볍게, 핵심은 빠뜨리지 않고."],
     "key_points": [], "closing_line": "오늘은 여기까지면 충분해요."},
]


def _kst_today() -> str:
    return datetime.now(_KST).strftime("%Y-%m-%d")


def _load_today_letters(date_str: str) -> tuple[Dict[str, Dict[str, Any]], str]:
    """그룹→레터 맵 + 소스('pgvector'|'mock').

    today_letters API 와 동일 경로(PgVectorV2Client.get_daily_letters +
    _shape_letter_response)를 재사용 — 발송 내용이 라이브 '오늘의 한 통'과 동일.
    4그룹 미완/조회실패/오프라인이면 MOCK 폴백.
    """
    try:
        from v2.clients.pgvector_v2_client import PgVectorV2Client  # noqa: lazy
        from v2.handlers.today_letters import _shape_letter_response  # noqa: lazy

        pg = PgVectorV2Client()
        try:
            rows = pg.get_daily_letters(date_str)
        finally:
            pg.close()
        if rows:
            shaped = [_shape_letter_response(r) for r in rows]
            by = {s["mbti_group"]: s for s in shaped if s.get("mbti_group")}
            if len(by) == 4:
                logger.info('{"event":"letters_loaded","date":"%s","src":"pgvector"}', date_str)
                return by, "pgvector"
            logger.warning('{"event":"letters_incomplete","date":"%s","groups":%d}',
                            date_str, len(by))
    except Exception as e:
        logger.warning('{"event":"letters_fallback_local","err":"%s"}', type(e).__name__)

    # pgvector 미적재/불완전 → 로컬 미러 폴백 (사이트의 '오늘의 한 통'과 동일 내용)
    from v2.newsletter.local_letters import load_local_letters  # noqa: lazy

    local = load_local_letters(date_str)
    if local and len(local) == 4:
        logger.info('{"event":"letters_loaded","date":"%s","src":"local"}', date_str)
        return local, "local"

    return {l["mbti_group"]: l for l in MOCK_LETTERS}, "mock"


@handler_decorator
async def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    use_mock = os.environ.get("NEWSLETTER_FORCE_MOCK", "0") == "1"
    date_str = _kst_today()
    letters, letters_source = _load_today_letters(date_str)
    subs = load_active_subscribers(use_mock=use_mock)

    sent = 0
    skipped = 0
    errors = 0
    for s in subs:
        g = s.get("mbti_group")
        letter = letters.get(g)
        if not letter:
            skipped += 1
            logger.warning('{"event":"newsletter_skip_no_letter","group":"%s"}', g)
            continue
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
