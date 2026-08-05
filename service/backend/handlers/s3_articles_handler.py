"""
S3 Articles Handler Lambda Function
Fetches articles directly from S3 XML storage (sedaily-news-xml-storage).

This handler reads ORIGINAL articles from the raw XML bucket (ap-northeast-2),
NOT from the Article DB (DynamoDB + S3 body). It serves as the primary list
endpoint before MBTI transformation is applied.

For MBTI-transformed article detail, use article_handler.py which reads from
the split Article DB (DynamoDB metadata + S3 body pointer).

Endpoints:
- GET /s3-articles?date=YYYYMMDD&limit=30&category=경제
- GET /s3-article/{article_id}?date=YYYYMMDD
- GET /s3-articles/keyword?keywords=a,b,c&days=7&limit=20
    └ 키워드(쉼표 구분) hit 카운트로 매칭 + 최신순 정렬. 점수 0 제외.
"""
import logging
import json
import asyncio
from datetime import datetime, timezone, timedelta
from typing import Optional, List

from clients.s3_xml_client import S3XMLClient
from config import settings

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# S3 XML Client (initialized once per Lambda container)
_s3_client: Optional[S3XMLClient] = None

def get_s3_client() -> S3XMLClient:
    """Get or create S3XMLClient instance"""
    global _s3_client
    if _s3_client is None:
        _s3_client = S3XMLClient(region=settings.s3_region)
    return _s3_client


def _get_kst_today() -> str:
    """Get today's date in YYYYMMDD format (KST)"""
    kst = timezone(timedelta(hours=9))
    return datetime.now(kst).strftime("%Y%m%d")


async def get_articles_list(
    date_str: Optional[str] = None,
    limit: int = 30,
    category: Optional[str] = None
) -> dict:
    """
    Fetch article list from S3 XML

    Args:
        date_str: Date in YYYYMMDD format (default: today)
        limit: Maximum articles to return
        category: Filter by category (경제, 정치, 사회, IT_과학, 문화, etc.)

    Returns:
        Dict with date, total count, and articles list
    """
    if not date_str:
        date_str = _get_kst_today()

    client = get_s3_client()
    articles = await client.get_articles_by_date(date_str)

    if not articles:
        return {
            "date": date_str,
            "total": 0,
            "articles": [],
            "message": f"No articles found for {date_str}"
        }

    # Filter: exclude deleted articles
    articles = [a for a in articles if a.action != 'D']

    # Filter by category if specified
    if category:
        articles = [a for a in articles if a.main_category == category]

    # Sort by published_at descending
    articles.sort(key=lambda x: x.published_at, reverse=True)

    # Apply limit
    articles = articles[:limit]

    # Transform to response format
    result_articles = []
    for article in articles:
        # Extract first image URL
        image_url = None
        if article.images:
            image_url = article.images[0].url
        elif article.content_images:
            image_url = article.content_images[0].url

        result_articles.append({
            "news_id": article.nsid,
            "title": article.title,
            "sub_title": article.sub_title or "",
            "published_at": article.published_at,
            "category": article.main_category,
            "provider": article.press,
            "byline": article.author_name,
            "image_url": image_url,
            "content": article.content_clean[:2000] if article.content_clean else "",
            "original_link": article.url,
        })

    return {
        "date": date_str,
        "total": len(result_articles),
        "articles": result_articles
    }


async def search_articles_by_keywords(
    keywords: List[str],
    days: int = 7,
    limit: int = 20,
) -> dict:
    """
    최근 N일분 XML 에서 키워드 hit 카운트로 매칭된 기사 검색.

    Args:
        keywords: 검색 키워드 리스트 (소문자/원문 무관, lowercase 비교)
        days: 거슬러 올라갈 일수 (기본 7)
        limit: 반환 최대 개수 (기본 20)

    Returns:
        {keywords, days_searched, total, articles: [{...같은 형식, matches}]}
    """
    if not keywords:
        return {"keywords": [], "total": 0, "articles": []}

    # 소문자 + dedup
    kws = list({k.strip().lower() for k in keywords if k and len(k.strip()) >= 2})
    if not kws:
        return {"keywords": [], "total": 0, "articles": []}

    client = get_s3_client()
    kst = timezone(timedelta(hours=9))
    today = datetime.now(kst)

    # 최근 days 일 XML 모두 fetch — 캐시 hit 가 있을 수 있고 동시 호출 가능
    all_articles = []
    for d in range(days):
        target = (today - timedelta(days=d)).strftime("%Y%m%d")
        try:
            day_articles = await client.get_articles_by_date(target)
            if day_articles:
                all_articles.extend(day_articles)
        except Exception as e:
            logger.warning(f"XML fetch failed for {target}: {e}")

    if not all_articles:
        return {
            "keywords": kws,
            "days_searched": days,
            "total": 0,
            "articles": [],
            "message": "No articles in window",
        }

    # 삭제된 기사 제외
    all_articles = [a for a in all_articles if a.action != 'D']

    # 점수 매기기 — title + sub_title + content_clean (앞 1000자) 합쳐 키워드 hit 카운트
    scored = []
    for art in all_articles:
        haystack = ' '.join([
            art.title or '',
            art.sub_title or '',
            (art.content_clean or '')[:1000],
        ]).lower()
        if not haystack.strip():
            continue
        matches = sum(1 for kw in kws if kw in haystack)
        if matches > 0:
            scored.append((art, matches))

    # 점수 desc → 동률은 published_at desc
    scored.sort(key=lambda x: (x[1], x[0].published_at or ''), reverse=True)

    # limit 적용
    scored = scored[:limit]

    # 응답 포맷
    result_articles = []
    for art, matches in scored:
        image_url = None
        if art.images:
            image_url = art.images[0].url
        elif art.content_images:
            image_url = art.content_images[0].url

        result_articles.append({
            "news_id": art.nsid,
            "title": art.title,
            "sub_title": art.sub_title or "",
            "published_at": art.published_at,
            "category": art.main_category,
            "provider": art.press,
            "byline": art.author_name,
            "image_url": image_url,
            "original_link": art.url,
            "matches": matches,
        })

    return {
        "keywords": kws,
        "days_searched": days,
        "total": len(result_articles),
        "articles": result_articles,
    }


async def get_article_detail(
    article_id: str,
    date_str: Optional[str] = None
) -> dict:
    """
    Fetch single article detail from S3 XML

    Args:
        article_id: Article ID (nsid)
        date_str: Date in YYYYMMDD format (optional, searches recent 7 days if not found)

    Returns:
        Article detail dict or error
    """
    client = get_s3_client()

    # Try specified date first, then today
    dates_to_try = []
    if date_str:
        dates_to_try.append(date_str)
    dates_to_try.append(_get_kst_today())

    # Add last 7 days
    kst = timezone(timedelta(hours=9))
    for days_ago in range(1, 8):
        past_date = (datetime.now(kst) - timedelta(days=days_ago)).strftime("%Y%m%d")
        if past_date not in dates_to_try:
            dates_to_try.append(past_date)

    article = None
    for try_date in dates_to_try:
        articles = await client.get_articles_by_date(try_date)
        article = next((a for a in articles if a.nsid == article_id), None)
        if article:
            break

    if not article:
        return {"error": "Article not found", "article_id": article_id}

    # Extract first image URL
    image_url = None
    if article.images:
        image_url = article.images[0].url
    elif article.content_images:
        image_url = article.content_images[0].url

    return {
        "news_id": article.nsid,
        "title_ko": article.title,
        "sub_title": article.sub_title or "",
        "content_ko": article.content_clean,
        "published_at": article.published_at,
        "category": article.main_category,
        "provider": article.press,
        "byline": article.author_name,
        "author_email": article.author_email,
        "image_url": image_url,
        "images": [{"url": img.url, "caption": img.caption_content} for img in article.images],
        "original_link": article.url,
        "content_blocks": [
            {
                "type": block.block_type,
                "text": block.text_ko if block.block_type == "text" else "",
                "style": block.style if block.block_type == "text" else "",
                "image_url": block.image_url if block.block_type == "image" else "",
                "caption": block.image_caption if block.block_type == "image" else "",
            }
            for block in article.content_blocks
        ],
        "related_news": [{"title": rel.title, "url": rel.url} for rel in article.related_news],
        "is_breaking_news": article.is_breaking_news,
    }


def _response(status_code: int, body: dict) -> dict:
    """Create API Gateway response"""
    return {
        "statusCode": status_code,
        "headers": {
            "Content-Type": "application/json; charset=utf-8",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET,OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type"
        },
        "body": json.dumps(body, ensure_ascii=False)
    }


def lambda_handler(event: dict, context) -> dict:
    """
    AWS Lambda handler for S3 articles

    Routes:
    - GET /s3-articles - List articles
    - GET /s3-article/{article_id} - Article detail
    """
    logger.info(f"S3 Articles event: {json.dumps(event)}")

    try:
        # Parse request — HTTP API v2 (chzwwtjtgk) 와 REST API v1 둘 다 지원
        request_context = event.get("requestContext", {}) or {}
        if request_context.get("http"):
            # HTTP API v2 (현재 production)
            http_method = request_context["http"].get("method", "GET")
            path = request_context["http"].get("path", "")
        else:
            # REST API v1 fallback
            http_method = event.get("httpMethod", "GET")
            path = event.get("path", "")
        path_params = event.get("pathParameters") or {}
        query_params = event.get("queryStringParameters") or {}

        # Handle OPTIONS (CORS preflight)
        if http_method == "OPTIONS":
            return _response(200, {"message": "OK"})

        # Route: /s3-articles/keyword — 키워드 매칭 기반 추천 검색
        if "/keyword" in path:
            kw_raw = (query_params.get("keywords") or "").strip()
            if not kw_raw:
                return _response(400, {"error": "Missing required query param: keywords (comma-separated)"})
            keywords = [k for k in (s.strip() for s in kw_raw.split(",")) if k]
            try:
                days = max(1, min(int(query_params.get("days", "7")), 30))
            except ValueError:
                days = 7
            try:
                limit = max(1, min(int(query_params.get("limit", "20")), 100))
            except ValueError:
                limit = 20
            result = asyncio.run(search_articles_by_keywords(keywords, days, limit))
            return _response(200, result)

        # Route: /s3-article/{article_id}
        if "/s3-article/" in path or path_params.get("article_id"):
            article_id = path_params.get("article_id") or path.split("/")[-1]
            date_str = query_params.get("date")

            # `asyncio.get_event_loop()` is deprecated in Python 3.10+ when no
            # loop is running. `asyncio.run` creates a fresh loop and tears it
            # down cleanly, which is the right pattern for a sync Lambda entry
            # point.
            result = asyncio.run(get_article_detail(article_id, date_str))

            if "error" in result:
                return _response(404, result)
            return _response(200, result)

        # Route: /s3-articles
        date_str = query_params.get("date")
        limit = int(query_params.get("limit", "30"))
        category = query_params.get("category")

        result = asyncio.run(get_articles_list(date_str, limit, category))

        return _response(200, result)

    except Exception as e:
        logger.error(f"S3 Articles error: {e}", exc_info=True)
        return _response(500, {
            "error": str(e),
            "message": "Failed to fetch articles from S3"
        })
