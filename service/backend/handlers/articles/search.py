"""
검색 Lambda 핸들러.

검색 로직(GSI 쿼리, 중복 제거, 페이지네이션, warm-container 캐시)은 services/articles/search.py 에
있으며, 이 파일은 HTTP 요청 파싱과 응답 조립만 담당한다. 테이블 Scan 은 비용 문제로 사용하지 않는다.
"""
import logging
import json
from datetime import datetime

from config.constants import CORS_HEADERS
from services.articles import search as svc

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


def lambda_handler(event: dict, context) -> dict:
    """검색 Lambda 핸들러."""
    try:
        # Parse request body
        body = event.get("body", {})
        if isinstance(body, str):
            body = json.loads(body)

        query = body.get("query", "")
        filters = body.get("filters", {})
        page = int(body.get("page", 1))
        page_size = int(body.get("page_size", 10))

        logger.info(f"Search request: query='{query}', filters={filters}, page={page}")

        # Execute optimized search
        response = svc.search_dynamodb_optimized(
            query=query,
            published_from=filters.get("published_from", "2024-01-01"),
            published_until=filters.get("published_until", datetime.now().strftime("%Y-%m-%d")),
            categories=filters.get("categories", []),
            page=page,
            page_size=page_size
        )

        logger.info(f"Search completed: {response.total_hits} hits, page {response.page}/{response.total_pages}")

        return {
            "statusCode": 200,
            "headers": CORS_HEADERS,
            "body": json.dumps({
                "total_hits": response.total_hits,
                "page": response.page,
                "page_size": response.page_size,
                "total_pages": response.total_pages,
                "articles": response.articles
            })
        }

    except Exception as e:
        logger.error(f"Search error: {e}", exc_info=True)
        return {
            "statusCode": 500,
            "headers": CORS_HEADERS,
            "body": json.dumps({
                "error": {
                    "code": "SEARCH_ERROR",
                    "message": str(e)
                }
            })
        }
