"""S3 Articles 비즈니스 로직 — S3 XML 원문 기사 목록·키워드 검색·상세 조회.

원본 XML 버킷(sedaily-news-xml-storage, ap-northeast-2)에서 기사를 직접 읽는다.
PostgreSQL 기사 DB를 읽는 경로는 `services/articles/article.py`를 참조한다.
"""
import json
import logging
from datetime import datetime, timezone, timedelta
from typing import Optional, List

from clients.s3.xml_articles import S3XMLClient
from config import settings
from common.dates.date_utils import get_kst_today

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# Lambda 컨테이너당 1회 초기화하는 S3 XML 클라이언트
_s3_client: Optional[S3XMLClient] = None

def get_s3_client() -> S3XMLClient:
    global _s3_client
    if _s3_client is None:
        _s3_client = S3XMLClient(region=settings.s3_region)
    return _s3_client


async def get_articles_list(
    date_str: Optional[str] = None,
    limit: int = 30,
    category: Optional[str] = None
) -> dict:
    """S3 XML에서 기사 목록을 조회한다.

    Args:
        date_str: YYYYMMDD(기본: 오늘).
        limit: 최대 반환 건수.
        category: 카테고리 필터(경제, 정치, 사회, IT_과학, 문화 등).

    Returns:
        date, total, articles 를 담은 dict.
    """
    if not date_str:
        date_str = get_kst_today()

    client = get_s3_client()
    articles = await client.get_articles_by_date(date_str)

    if not articles:
        return {
            "date": date_str,
            "total": 0,
            "articles": [],
            "message": f"No articles found for {date_str}"
        }

    # 삭제(action=D) 기사 제외
    articles = [a for a in articles if a.action != 'D']

    if category:
        articles = [a for a in articles if a.main_category == category]

    # 최신순 정렬
    articles.sort(key=lambda x: x.published_at, reverse=True)

    articles = articles[:limit]

    result_articles = []
    for article in articles:
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

    # 최근 days 일의 XML을 모두 조회한다.
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

    # title + sub_title + content_clean(앞 1000자)에서 키워드 hit 수를 점수로 쓴다.
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

    scored = scored[:limit]

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
    """S3 XML에서 기사 1건의 상세를 조회한다.

    Args:
        article_id: 기사 ID(nsid).
        date_str: YYYYMMDD(선택). 지정일 → 오늘 → 최근 7일 순으로 찾는다.

    Returns:
        기사 상세 dict, 없으면 error dict.
    """
    client = get_s3_client()

    dates_to_try = []
    if date_str:
        dates_to_try.append(date_str)
    dates_to_try.append(get_kst_today())

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


def response(status_code: int, body: dict) -> dict:
    """API Gateway 응답을 만든다."""
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
