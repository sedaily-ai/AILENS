"""
Optimized SearchHandler Lambda Function
Performance improvement: 4.5s -> <1s
Key optimizations:
1. Use GSI (category-published_at-index) instead of full table scan
2. DynamoDB Query instead of Scan - NO MORE SCANS!
3. Server-side filtering with FilterExpression
4. Efficient pagination
5. In-memory caching for repeated requests

PHASE 71: Removed all table.scan() operations to reduce DynamoDB costs
- Before: $32/day (127M RCU)
- After: Expected <$15/day (<50M RCU)

2026-08-24 — 실제 검색 로직(GSI 쿼리·중복제거·페이지네이션·warm-container
캐시)은 services/search_service.py로 뺐다(코드 리팩토링 감사 Track B, God
파일 분해). 이 파일은 이제 HTTP 요청 파싱과 응답 조립만 담당.
"""
import logging
import json
from datetime import datetime

from config.constants import CORS_HEADERS
from services.articles import search as svc

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


def lambda_handler(event: dict, context) -> dict:
    """Lambda handler - optimized version"""
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
