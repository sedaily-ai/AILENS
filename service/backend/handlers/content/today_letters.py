"""GET /api/v2/today-letters — Today Letters API.

Returns 4 daily_letters rows for the requested date (default = KST today).

Response shape (matches frontend mockTodayFeed expectations):
```json
{
  "date": "2026-05-14",
  "mode": "A",
  "letters": [
    {
      "id": "...", "editor_id": "NT-min",
      "article_id": "...", "archetype": "...", "theme": "...",
      "headline": "...", "subtitle": "...", "closing_line": "...",
      "body": [...], "key_points": [...], "keywords": [...],
      "secondary_article_ids": [...]
    }, ... (4)
  ]
}
```

empty (no letters today) → returns 200 with letters=[] and mode=null.
프론트는 이 경우 mock fallback 으로 떨어지면 됨.
"""
from __future__ import annotations

import json
import logging
from datetime import datetime
from utils.date_validation import KST as _KST
from typing import Any, Dict, List

from config.constants import CORS_HEADERS
from core.decorators import lambda_handler as handler_decorator
from core.response import error_response, success_response

from clients.ddb import daily_letters as letters_client


logger = logging.getLogger(__name__)
logging.getLogger().setLevel(logging.INFO)



def _parse_query_date(event: Dict[str, Any]) -> str:
    qs = event.get("queryStringParameters") or {}
    raw = qs.get("date")
    if raw:
        # 단순 형식 검증 — YYYY-MM-DD.
        try:
            datetime.strptime(raw, "%Y-%m-%d")
            return raw
        except ValueError:
            raise ValueError(f"invalid date: {raw!r}; expected YYYY-MM-DD")
    return datetime.now(tz=_KST).date().isoformat()


def _flatten_mode_a_articles(articles: List[Dict[str, Any]]) -> List[str]:
    """v1 mode-A ``articles[]`` → 프론트가 렌더하는 ``body[]`` 문자열 라인.

    Editor Pick(orchestrator)은 편지를 기사 4건 묶음(mode A)으로 만들고 각 기사에
    ``summary / qa / insight`` 를 담는다. 반면 프론트 LetterDetailClient 는
    ``body: string[]`` 를 라인별로 렌더한다. 그 렌더러의 마커 규칙에 맞춰 평탄화:
      ``■ ...``          → 섹션 헤더 (기사별)
      ``Q. .. A. ..``    → FAQ 블록 (한 문자열 안에 Q/A 동시 — 렌더러 정규식 기준)
      ``[인사이트] ..``  → 콜아웃 박스
    나머지 줄은 일반 문단으로 렌더된다.
    """
    body: List[str] = []
    for i, art in enumerate(articles):
        if not isinstance(art, dict):
            continue
        title = art.get("thumbnail_title") or art.get("original_title") or ""
        body.append(f"■ {i + 1}. {title}".rstrip())
        for s in art.get("summary") or []:
            if s:
                body.append(str(s))
        for qa in art.get("qa") or []:
            if isinstance(qa, dict):
                q = (qa.get("q") or "").strip()
                a = (qa.get("a") or "").strip()
                if q and a:
                    body.append(f"Q. {q} A. {a}")
        ins = art.get("insight") or {}
        if isinstance(ins, dict):
            a = (ins.get("a") or "").strip()
            if a:
                body.append(f"[인사이트] {a}")
    return body


def _key_points_from_mode_a(articles: List[Dict[str, Any]]) -> List[str]:
    """mode-A 기사들의 대표 제목 → 프론트 '핵심 정리' 불릿."""
    pts: List[str] = []
    for art in articles:
        if isinstance(art, dict):
            t = art.get("thumbnail_title") or art.get("original_title")
            if t:
                pts.append(str(t))
    return pts


def _enrich_body(letter_row: Dict[str, Any]) -> Dict[str, Any]:
    """``body_inline`` → 프론트 렌더용 ``{body[], key_points[]}``.

    두 형식을 모두 처리한다:
      * 신형식 — ``body_inline.body[]`` 가 이미 있으면 그대로 통과 (mock/향후).
      * v1 mode-A — ``body_inline.articles[]`` 이면 ``body[]`` 로 평탄화
        (Editor Pick 산출물). 이게 없으면 프론트 상세가 빈 본문으로 보인다.

    Phase 1 에서는 ``body_s3_uri`` 미사용 — inline 만 읽는다.
    """
    inline = letter_row.get("body_inline") or {}
    if isinstance(inline, str):
        try:
            inline = json.loads(inline)
        except Exception:
            inline = {}

    if inline.get("body"):
        return {
            "body": inline.get("body") or [],
            "key_points": inline.get("key_points") or [],
        }

    articles = inline.get("articles")
    if isinstance(articles, list) and articles:
        return {
            "body": _flatten_mode_a_articles(articles),
            "key_points": _key_points_from_mode_a(articles),
        }

    return {"body": [], "key_points": []}


def shape_letter_response(row: Dict[str, Any]) -> Dict[str, Any]:
    """DDB row → API 응답 shape. newsletter/today_letter.py도 이 함수를 재사용한다
    (발송 내용이 라이브 '오늘의 한 통'과 동일해야 하므로) — public API로 취급."""
    enriched = _enrich_body(row)
    keywords = row.get("keywords") or []
    if isinstance(keywords, str):
        try:
            keywords = json.loads(keywords)
        except Exception:
            keywords = []
    return {
        "id": row["id"],
        "editor_id": row["editor_id"],
        "article_id": row["article_id"],
        "secondary_article_ids": row.get("secondary_article_ids") or [],
        "archetype": row.get("archetype"),
        "theme": row.get("theme"),
        "headline": row["headline"],
        "subtitle": row.get("subtitle"),
        "closing_line": row.get("closing_line"),
        "body": enriched["body"],
        "key_points": enriched["key_points"],
        "keywords": keywords,
        # article_id 기반 자동 생성 파이프라인이 안 되는 레터(빈 article_id 등)를 위해
        # admin 이 수동 업로드한 팟캐스트 URL — 없으면 None, 프론트가 기존 흐름으로 폴백.
        "podcast_audio_url": row.get("podcast_audio_url"),
    }


@handler_decorator
async def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    method = (
        event.get("httpMethod")
        or (event.get("requestContext") or {}).get("http", {}).get("method")
        or "GET"
    )
    if method == "OPTIONS":
        return {"statusCode": 200, "headers": CORS_HEADERS, "body": ""}

    try:
        letter_date = _parse_query_date(event)
    except ValueError as exc:
        return error_response(str(exc), status_code=400, code="VALIDATION")

    rows = letters_client.get_daily_letters(letter_date)

    if not rows:
        logger.info(json.dumps({
            "event": "today_letters_empty",
            "letter_date": letter_date,
        }))
        return success_response({
            "date": letter_date,
            "mode": None,
            "letters": [],
        })

    shaped = [shape_letter_response(r) for r in rows]
    mode = rows[0].get("mode") if rows else None

    return success_response({
        "date": letter_date,
        "mode": mode,
        "letters": shaped,
    })
