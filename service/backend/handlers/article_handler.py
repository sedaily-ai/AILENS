"""
ArticleHandler Lambda Function
Handles article detail retrieval.

When user views an article:
1. Fetch from DynamoDB
2. Return the article's original content
"""
import logging
from typing import Optional
from dataclasses import dataclass

from clients.dynamodb_client import DynamoDBClient
from config.constants import CORS_HEADERS
from core.decorators import lambda_handler as handler_decorator
from core.response import success_response
from utils.date_utils import get_kst_today

logger = logging.getLogger(__name__)


@dataclass
class ArticleDetailResponse:
    """Article detail response"""
    news_id: str
    title_ko: str
    content_ko: str
    published_at: str
    provider: str
    category: str
    updated_at: Optional[str] = None
    byline: Optional[str] = None
    original_link: Optional[str] = None
    image_url: Optional[str] = None
    images: list = None
    images_caption: list = None
    content_blocks: list = None
    keywords: Optional[str] = None
    hashtags: Optional[str] = None
    transformed_at: Optional[str] = None

    def __post_init__(self):
        if self.images is None:
            self.images = []
        if self.images_caption is None:
            self.images_caption = []
        if self.content_blocks is None:
            self.content_blocks = []
        # Extract first image URL if not already set
        if self.image_url is None and self.images:
            if isinstance(self.images, list) and len(self.images) > 0:
                first_img = self.images[0]
                if isinstance(first_img, dict):
                    self.image_url = first_img.get('url', '')
                elif isinstance(first_img, str):
                    self.image_url = first_img


class ArticleHandlerError(Exception):
    """Base exception for ArticleHandler errors"""
    pass


class ArticleHandler:
    """
    Handles article detail retrieval from DynamoDB
    """

    def __init__(self, dynamodb_client: DynamoDBClient):
        """
        Initialize ArticleHandler with DynamoDB client

        Args:
            dynamodb_client: Client for DynamoDB storage
        """
        self.dynamodb_client = dynamodb_client
    
    async def handle_article_detail(
        self,
        article_id: str
    ) -> ArticleDetailResponse:
        """
        Handle article detail request.

        Returns the article's original content.

        Args:
            article_id: Article ID (news_id)

        Returns:
            ArticleDetailResponse

        Raises:
            ArticleHandlerError: If retrieval fails
        """
        try:
            # Validate article_id
            if not article_id or not article_id.strip():
                raise ArticleHandlerError("Article ID is required")

            # Retrieve from DynamoDB
            cached_article = await self.dynamodb_client.get_article(article_id)
            if not cached_article:
                logger.warning(f"Article {article_id} not found in DynamoDB")
                raise ArticleHandlerError(
                    "Article not found. This article has not been processed yet."
                )

            logger.info(f"Retrieved article {article_id} from DynamoDB")

            return ArticleDetailResponse(
                news_id=cached_article['news_id'],
                title_ko=cached_article.get('title_ko', ''),
                content_ko=cached_article.get('content_ko', ''),
                published_at=cached_article.get('published_at', ''),
                provider=cached_article.get('press', '서울경제'),
                category=cached_article.get('category', 'news'),
                updated_at=cached_article.get('updated_at'),
                byline=cached_article.get('byline', '서울경제'),
                original_link=cached_article.get('original_link'),
                images=cached_article.get('images', []),
                images_caption=cached_article.get('images_caption', []),
                content_blocks=cached_article.get('content_blocks', []),
                keywords=cached_article.get('keywords', ''),
                hashtags=cached_article.get('hashtags', ''),
                transformed_at=cached_article.get('transformed_at'),
            )

        except ArticleHandlerError:
            # Re-raise our own errors
            raise
        except Exception as e:
            # Catch-all for unexpected errors
            logger.error(f"Unexpected error in article handler: {e}", exc_info=True)
            raise ArticleHandlerError(
                "An unexpected error occurred. Please try again later."
            )


def _extract_image_url(images) -> Optional[str]:
    """Extract first image URL from an article's images field.

    Images can be a list of dicts ({'url': ..., 'caption': ...}) or plain strings.
    Returns None if nothing usable is present.
    """
    if not images or not isinstance(images, list) or len(images) == 0:
        return None
    first = images[0]
    if isinstance(first, dict):
        return first.get('url') or None
    if isinstance(first, str):
        return first
    return None


def _transform_article_for_list(article: dict) -> dict:
    """Shape a DynamoDB+S3-merged article into the /api/articles list item format."""
    content_ko = article.get('content_ko') or ''
    return {
        'news_id': article.get('news_id', ''),
        'title': article.get('title_ko', ''),
        'sub_title': article.get('sub_title_ko', ''),
        'published_at': article.get('published_at', ''),
        'category': article.get('category', ''),
        'provider': article.get('press', '서울경제'),
        'byline': article.get('byline', ''),
        'image_url': _extract_image_url(article.get('images')),
        'content': content_ko[:500],
        'original_link': article.get('original_link', ''),
    }


@handler_decorator
async def list_handler(event: dict, context) -> dict:
    """
    GET /api/articles?date=YYYYMMDD&limit=30

    List articles for a given date. Reads from the Article DB (DynamoDB
    metadata + S3 body), filtering to articles that have been through the
    pipeline (those with an s3_body_uri pointer).

    Defaults: date = today (KST), limit = 30.
    """
    from config import settings
    from clients.s3_article_client import S3ArticleClient

    query_params = event.get("queryStringParameters") or {}

    date_str = (query_params.get("date") or "").strip() or get_kst_today()

    try:
        limit = int(query_params.get("limit", 30))
    except (ValueError, TypeError):
        limit = 30
    limit = max(1, min(limit, 200))

    s3_article_client = S3ArticleClient(
        bucket_name=settings.s3_article_body_bucket,
        region=settings.s3_article_body_region,
    )
    dynamodb_client = DynamoDBClient(
        table_name=settings.dynamodb_table_articles,
        region=settings.region,
        s3_article_client=s3_article_client,
    )

    articles = await dynamodb_client.get_transformed_articles_by_date(
        date_str, limit,
    )

    result_articles = [_transform_article_for_list(a) for a in articles] if articles else []

    response_data = {
        "date": date_str,
        "total": len(result_articles),
        "articles": result_articles,
    }

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
    import asyncio

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
    from config import settings
    
    try:
        # Parse request
        path_parameters = event.get("pathParameters", {})
        article_id = path_parameters.get("article_id", "")
        
        if not article_id:
            import json
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
        
        # Initialize services with S3 body retrieval
        from clients.s3_article_client import S3ArticleClient
        s3_article_client = S3ArticleClient(
            bucket_name=settings.s3_article_body_bucket,
            region=settings.s3_article_body_region,
        )
        dynamodb_client = DynamoDBClient(
            table_name=settings.dynamodb_table_articles,
            region=settings.region,
            s3_article_client=s3_article_client,
        )

        # Create handler and process request
        handler = ArticleHandler(dynamodb_client=dynamodb_client)
        response = await handler.handle_article_detail(article_id)
        
        # Return success response
        import json
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
        import json
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
        import json
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
