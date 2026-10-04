"""
S3 Articles Handler Lambda Function
Fetches articles directly from S3 XML storage (sedaily-news-xml-storage).

Endpoints:
- GET /s3-articles?date=YYYYMMDD&limit=30&category=경제
- GET /s3-article/{article_id}?date=YYYYMMDD
- GET /s3-articles/keyword?keywords=a,b,c&days=7&limit=20
    └ 키워드(쉼표 구분) hit 카운트로 매칭 + 최신순 정렬. 점수 0 제외.

2026-08-24 — 실제 로직(S3 XML 조회·키워드 매칭·응답 shaping)은
services/s3_articles_service.py로 뺐다(코드 리팩토링 감사 Track B, God
파일 분해). 이 파일은 이제 HTTP 라우팅만 담당한다.
"""
import logging
import json
import asyncio

from services.articles import s3_articles as svc

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


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
            return svc.response(200, {"message": "OK"})

        # Route: /s3-articles/keyword — 키워드 매칭 기반 추천 검색
        if "/keyword" in path:
            kw_raw = (query_params.get("keywords") or "").strip()
            if not kw_raw:
                return svc.response(400, {"error": "Missing required query param: keywords (comma-separated)"})
            keywords = [k for k in (s.strip() for s in kw_raw.split(",")) if k]
            try:
                days = max(1, min(int(query_params.get("days", "7")), 30))
            except ValueError:
                days = 7
            try:
                limit = max(1, min(int(query_params.get("limit", "20")), 100))
            except ValueError:
                limit = 20
            result = asyncio.run(svc.search_articles_by_keywords(keywords, days, limit))
            return svc.response(200, result)

        # Route: /s3-article/{article_id}
        if "/s3-article/" in path or path_params.get("article_id"):
            article_id = path_params.get("article_id") or path.split("/")[-1]
            date_str = query_params.get("date")

            # `asyncio.get_event_loop()` is deprecated in Python 3.10+ when no
            # loop is running. `asyncio.run` creates a fresh loop and tears it
            # down cleanly, which is the right pattern for a sync Lambda entry
            # point.
            result = asyncio.run(svc.get_article_detail(article_id, date_str))

            if "error" in result:
                return svc.response(404, result)
            return svc.response(200, result)

        # Route: /s3-articles
        date_str = query_params.get("date")
        limit = int(query_params.get("limit", "30"))
        category = query_params.get("category")

        result = asyncio.run(svc.get_articles_list(date_str, limit, category))

        return svc.response(200, result)

    except Exception as e:
        logger.error(f"S3 Articles error: {e}", exc_info=True)
        return svc.response(500, {
            "error": str(e),
            "message": "Failed to fetch articles from S3"
        })
