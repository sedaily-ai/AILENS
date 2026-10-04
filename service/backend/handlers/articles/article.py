"""
ArticleHandler Lambda Function
Handles article detail retrieval.

2026-08-24 — 실제 조회 로직(DynamoDB+S3 병합, 리스트 응답 shaping,
ArticleHandler/ArticleDetailResponse)은 services/article_service.py로
뺐다(코드 리팩토링 감사 Track B, God 파일 분해). 이 파일은 이제 HTTP
라우팅과 응답 조립만 담당한다.
"""
import asyncio
import json
import logging

from config.constants import CORS_HEADERS
from core.decorators import lambda_handler as handler_decorator
from core.response import success_response
from services.articles.article import ArticleHandlerError, get_article_detail, list_articles

logger = logging.getLogger(__name__)


@handler_decorator
async def list_handler(event: dict, context) -> dict:
    """
    GET /api/articles?date=YYYYMMDD&limit=30

    List articles for a given date. Defaults: date = today (KST), limit = 30.
    """
    query_params = event.get("queryStringParameters") or {}
    response_data = await list_articles(
        query_params.get("date"),
        query_params.get("limit", 30),
    )
    return success_response(response_data)


def lambda_handler(event: dict, context) -> dict:
    """
    AWS Lambda handler for article routes.

    Routes:
      OPTIONS *                                      → CORS preflight
      GET /api/articles?date=YYYYMMDD&limit=30       → list transformed articles (list_handler)
      GET /api/article/{article_id}                  → legacy detail handler (_async_handler)

    Supports both HTTP API v2 (payload 2.0, no top-level path/httpMethod — uses
    routeKey and requestContext.http.*) and REST API v1 (top-level path/httpMethod).
    """
    route_key = event.get("routeKey") or ""
    rc = event.get("requestContext") or {}
    http_ctx = rc.get("http") if isinstance(rc, dict) else None
    if not isinstance(http_ctx, dict):
        http_ctx = {}

    http_method = (
        event.get("httpMethod")
        or http_ctx.get("method")
        or (route_key.split(" ", 1)[0] if " " in route_key else "GET")
    )
    path = (
        event.get("path")
        or http_ctx.get("path")
        or event.get("rawPath")
        or (route_key.split(" ", 1)[1] if " " in route_key else "")
    ) or ""

    if http_method == "OPTIONS":
        return {
            "statusCode": 200,
            "headers": CORS_HEADERS,
            "body": "",
        }

    # List route: GET /api/articles (plural). Matched by v2 routeKey first, then by
    # path-suffix fallback for v1. The singular /api/article/{id} route ends with
    # the article_id (not "articles"), so endswith disambiguation is safe.
    is_list_route = (
        route_key == "GET /api/articles"
        or (http_method == "GET" and path.rstrip("/").endswith("/api/articles"))
    )
    if is_list_route:
        return list_handler(event, context)

    # Default: legacy detail route, unchanged behavior and response shape.
    return asyncio.run(_async_handler(event, context))


async def _async_handler(event: dict, context) -> dict:
    """
    Async implementation of Lambda handler
    """
    try:
        # Parse request
        path_parameters = event.get("pathParameters", {})
        article_id = path_parameters.get("article_id", "")

        if not article_id:
            return {
                "statusCode": 400,
                # 이 응답만 CORS_HEADERS 대신 인라인 딕트를 써서
                # Access-Control-Allow-Methods/Headers가 빠져 있었다(같은 파일의
                # 다른 응답 4곳은 전부 CORS_HEADERS를 씀 — 2026-08-23 코드
                # 리팩토링 감사에서 발견, 통일).
                "headers": CORS_HEADERS,
                "body": json.dumps({
                    "error": {
                        "code": "MISSING_ARTICLE_ID",
                        "message": "Article ID is required",
                        "retry_possible": False
                    }
                })
            }

        response = await get_article_detail(article_id)

        # Return success response
        return {
            "statusCode": 200,
            "headers": CORS_HEADERS,
            "body": json.dumps({
                "news_id": response.news_id,
                "title_ko": response.title_ko,
                "content_ko": response.content_ko,
                "published_at": response.published_at,
                "updated_at": response.updated_at,
                "provider": response.provider,
                "category": response.category,
                "byline": response.byline,
                "original_link": response.original_link,
                "images": response.images,
                "images_caption": response.images_caption,
                "content_blocks": response.content_blocks,
                "keywords": response.keywords,
                "hashtags": response.hashtags,
                "transformed_at": response.transformed_at,
            })
        }

    except ArticleHandlerError as e:
        return {
            "statusCode": 400,
            "headers": CORS_HEADERS,
            "body": json.dumps({
                "error": {
                    "code": "ARTICLE_ERROR",
                    "message": str(e),
                    "retry_possible": True
                }
            })
        }

    except Exception as e:
        logger.error(f"Lambda handler error: {e}", exc_info=True)
        return {
            "statusCode": 500,
            "headers": CORS_HEADERS,
            "body": json.dumps({
                "error": {
                    "code": "INTERNAL_ERROR",
                    "message": "An unexpected error occurred. Please try again later.",
                    "retry_possible": True
                }
            })
        }
