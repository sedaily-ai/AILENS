"""Core 2.5 Editor Pick Lambda — daily 4-letter generator.

Trigger: EventBridge ``sedaily-mbti-v2-editor-pick-schedule`` (KST 05:30 daily).
Pipeline:
  1. Pull today's transformed candidates from pgvector (4-MBTI complete only).
  2. Opus 4.6 1 invoke → 4 letters (NT/NF/ST/SF).
  3. Upsert into daily_letters (UNIQUE(letter_date, editor_id) idempotent).

Failure policy: any unhandled exception bubbles to the @lambda_handler
decorator which returns a 500. Per-letter insert failures are logged inside
``run_editor_pick`` but don't abort the rest of the batch.

Observability (JSON log events):
  - editor_pick_invoke_complete (per Opus call)
  - editor_pick_run_complete (per fire)
  - editor_pick_empty_pool (no candidates for the day)
  - editor_pick_error (top-level exception)
"""
from __future__ import annotations

import json
import logging
import os
from typing import Any, Dict, Optional

from config.constants import CORS_HEADERS
from core.decorators import lambda_handler as handler_decorator
from core.response import success_response

from clients.pgvector_v2_client import PgVectorV2Client
from core25.editor_pick_service import (
    DEFAULT_CANDIDATE_POOL_SIZE,
    EditorPickError,
    run_editor_pick,
)


logger = logging.getLogger(__name__)
logging.getLogger().setLevel(logging.INFO)


@handler_decorator
async def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    method = (
        event.get("httpMethod")
        or (event.get("requestContext") or {}).get("http", {}).get("method")
        or "GET"
    )
    if method == "OPTIONS":
        return {"statusCode": 200, "headers": CORS_HEADERS, "body": ""}

    # 이벤트에 letter_date override 가 있으면 그걸로 (backfill·debug 용).
    # EventBridge 스케줄로 발화될 때는 빈 이벤트라 None → 서비스가 KST 오늘 결정.
    override_date: Optional[str] = None
    if isinstance(event, dict):
        override_date = event.get("letter_date")

    pool_size = int(os.getenv("EDITOR_PICK_POOL_SIZE", str(DEFAULT_CANDIDATE_POOL_SIZE)))

    from datetime import datetime, timedelta, timezone

    kst = timezone(timedelta(hours=9))
    now_kst = datetime.now(tz=kst)
    letter_date = override_date or now_kst.date().isoformat()

    pg = PgVectorV2Client()

    # 재시도 스케줄(하루 3회 발화) 가드 1 — 이미 그날 레터 4편이 있으면
    # Bedrock invoke 없이 스킵. UNIQUE(letter_date, editor_id) upsert 라
    # 재실행 자체는 안전하지만, 불필요한 생성 비용과 레터 덮어쓰기를 막는다.
    # 단, letter_date 를 명시한 수동 발화(backfill·재생성)는 의도된 덮어쓰기라
    # 가드를 건너뛴다 — 스케줄 발화(빈 이벤트)에만 적용.
    if override_date is None:
        try:
            existing = pg.get_daily_letters(letter_date)
        except Exception:
            existing = []
    else:
        existing = []
    if len(existing) >= 4:
        pg.close()
        logger.info(json.dumps({
            "event": "editor_pick_skipped_existing",
            "letter_date": letter_date,
            "existing": len(existing),
        }))
        return success_response({
            "letter_date": letter_date,
            "letters_inserted": 0,
            "status": "skipped_existing",
        })

    # 가드 2 — 스케줄 발화(override 없음)이고 최종 시도 전이면 '오늘 지면' 후보만
    # 허용. 지면이 늦으면 waiting 으로 빠지고 다음 발화가 잡는다. 최종 시도와
    # 수동 backfill 은 직전 지면일 fallback 허용 (일요일·휴간일 레터 보장).
    #
    # EDITOR_PICK_FINAL_ATTEMPT_HOUR: 재시도 크론(01/02/03시 3회)과 함께 3 으로
    # 설정한다. 기본 0 = 가드 비활성 — 단발 크론(01시 1회) 상태에서 이 가드가
    # 켜지면 지면 없는 날 레터가 아예 안 나가기 때문에 크론 변경과 묶어서 켠다.
    require_paper_date: str | None = None
    final_attempt_hour = int(os.getenv("EDITOR_PICK_FINAL_ATTEMPT_HOUR", "0"))
    if override_date is None and now_kst.hour < final_attempt_hour:
        require_paper_date = now_kst.strftime("%Y%m%d")

    # v3 (에세이형, 페르소나별 4 invoke) 는 기사 전문을 S3 original.json 에서
    # 읽는다. v1 경로는 이 인자를 무시한다.
    from clients.s3_article_v2_client import S3ArticleV2Client

    try:
        result = run_editor_pick(
            source=pg,
            sink=pg,
            letter_date=override_date,
            candidate_pool_size=pool_size,
            require_paper_date=require_paper_date,
            article_body_source=S3ArticleV2Client(),
        )
    except EditorPickError as exc:
        logger.error(json.dumps({
            "event": "editor_pick_error",
            "error_type": type(exc).__name__,
            "message": str(exc),
            "letter_date": override_date,
        }), exc_info=True)
        raise
    finally:
        pg.close()

    return success_response(result)
