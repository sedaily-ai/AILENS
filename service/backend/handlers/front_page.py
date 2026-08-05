"""GET /api/v2/front-page — 서울경제 지면 1면 기사 API.

Collector paper-mode 가 수집한 pgvector rows(metadata.paper_*)와 S3
``articles/{nsid}/original.json`` 본문을 합성해 1면 기사 목록을 반환한다.
(front-page-live-data spec §5.2)

Query: ``?date=YYYY-MM-DD`` (기본 = KST 오늘). 해당일 지면이 없으면(주말
휴간 등) 가장 가까운 이전 지면일로 fallback 하고 ``is_fallback=true``.

Response (200, envelope 없음):
```json
{
  "requested_date": "2026-07-23",
  "paper_date": "2026-07-23",
  "is_fallback": false,
  "articles": [
    {"news_id": "...", "title": "...", "sub_title": "...", "category": "...",
     "author_name": "...", "published_at": "...", "url": "...",
     "image_url": "...", "is_top": true,
     "content": "...", "content_blocks": [...]}
  ]
}
```
저장소가 완전히 비면 200 + ``articles=[]`` — 프론트는 정직한 빈 상태를
표시한다 (mock fallback 금지, spec §5.3).
"""
from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from config.constants import CORS_HEADERS
from core.decorators import lambda_handler as handler_decorator
from core.response import error_response, success_response

from clients.pgvector_v2_client import PgVectorV2Client
from clients.s3_article_v2_client import S3ArticleV2Client


logger = logging.getLogger(__name__)
logging.getLogger().setLevel(logging.INFO)

_KST = timezone(timedelta(hours=9))

# 지면은 하루 1회 발행 — 브라우저/중간 캐시 5분이면 충분히 신선 (spec §5.2).
_CACHE_CONTROL = "public, max-age=300"


def _parse_query_date(event: Dict[str, Any]) -> str:
    """``today_letters._parse_query_date`` 와 동일 규약 (YYYY-MM-DD)."""
    qs = event.get("queryStringParameters") or {}
    raw = qs.get("date")
    if raw:
        try:
            return datetime.strptime(raw, "%Y-%m-%d").date().isoformat()
        except ValueError:
            raise ValueError(f"invalid date: {raw!r}; expected YYYY-MM-DD")
    return datetime.now(tz=_KST).date().isoformat()


def _to_yyyymmdd(iso_date: str) -> str:
    return iso_date.replace("-", "")


def _to_iso(yyyymmdd: str) -> str:
    return f"{yyyymmdd[:4]}-{yyyymmdd[4:6]}-{yyyymmdd[6:]}"


def _shape_article(row: Dict[str, Any], body: Optional[Dict[str, Any]]) -> Dict[str, Any]:
    """pgvector row + S3 original.json → 응답 기사 1건.

    body 가 None(S3 누락/오류)이어도 목록에서 빠지지 않는다 — 제목/원문
    링크는 metadata 만으로 채워지고 본문 필드만 빈 값 (spec §8).
    """
    md = row.get("metadata") or {}
    b = body or {}
    images = b.get("images") or []
    image_url = ""
    if images and isinstance(images[0], dict):
        image_url = images[0].get("url") or ""
    return {
        "news_id": row["news_id"],
        "title": row.get("title") or "",
        "sub_title": md.get("sub_title") or "",
        "category": row.get("category") or "",
        "author_name": md.get("author_name") or "",
        "published_at": row.get("published_at"),
        "url": md.get("url") or "",
        "image_url": image_url,
        "is_top": (md.get("paper_paragraph") or "").strip() == "TOP",
        "content": b.get("content_ko") or "",
        "content_blocks": b.get("content_blocks") or [],
    }


async def _load_bodies(
    s3: S3ArticleV2Client, news_ids: List[str]
) -> Dict[str, Optional[Dict[str, Any]]]:
    """``original.json`` 병렬 로드. 개별 실패는 None — 목록 전체를 막지 않는다."""

    def _one(nid: str) -> Optional[Dict[str, Any]]:
        try:
            return s3.get_article_file(nid, "original.json")
        except Exception:
            logger.exception(f"front-page body load failed: {nid}")
            return None

    results = await asyncio.gather(*(asyncio.to_thread(_one, nid) for nid in news_ids))
    return dict(zip(news_ids, results))


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
        requested_iso = _parse_query_date(event)
    except ValueError as exc:
        return error_response(str(exc), status_code=400, code="VALIDATION")

    requested_ymd = _to_yyyymmdd(requested_iso)

    pg = PgVectorV2Client()
    try:
        rows = pg.get_front_page_articles(requested_ymd)
        paper_ymd = requested_ymd
        is_fallback = False
        if not rows:
            latest = pg.get_latest_front_page_date(requested_ymd)
            if latest and latest != requested_ymd:
                rows = pg.get_front_page_articles(latest)
                paper_ymd = latest
                is_fallback = bool(rows)
    finally:
        pg.close()

    if not rows:
        logger.info(json.dumps({
            "event": "front_page_empty",
            "requested_date": requested_iso,
        }))
        payload: Dict[str, Any] = {
            "requested_date": requested_iso,
            "paper_date": requested_iso,
            "is_fallback": False,
            "articles": [],
        }
    else:
        s3 = S3ArticleV2Client()
        bodies = await _load_bodies(s3, [r["news_id"] for r in rows])
        articles = [_shape_article(r, bodies.get(r["news_id"])) for r in rows]
        # 톱기사 우선, 이후 발행시각·news_id — 결정적 정렬 (spec §5.2)
        articles.sort(
            key=lambda a: (not a["is_top"], a["published_at"] or "", a["news_id"])
        )
        payload = {
            "requested_date": requested_iso,
            "paper_date": _to_iso(paper_ymd),
            "is_fallback": is_fallback,
            "articles": articles,
        }

    return success_response(payload, cache_control=_CACHE_CONTROL)
