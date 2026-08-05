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
"""
import logging
import boto3
from boto3.dynamodb.conditions import Key, Attr
from typing import List, Optional, Dict, Any
from dataclasses import dataclass
from datetime import datetime
import math
import json
import time
from config import settings
from config.constants import CATEGORIES_KOREAN, CATEGORY_SEARCH_ALIASES, CORS_HEADERS
from clients.s3_article_client import S3ArticleClient

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# =============================================================================
# In-Memory Cache (Lambda warm container)
# =============================================================================
_cache: Dict[str, Any] = {}
_cache_timestamps: Dict[str, float] = {}
CACHE_TTL_SECONDS = 300  # 5 minutes

def get_cached(key: str) -> Optional[Any]:
    """Get value from cache if not expired"""
    if key in _cache and key in _cache_timestamps:
        if time.time() - _cache_timestamps[key] < CACHE_TTL_SECONDS:
            logger.info(f"Cache HIT: {key}")
            return _cache[key]
        else:
            # Expired - remove
            del _cache[key]
            del _cache_timestamps[key]
    return None

def set_cached(key: str, value: Any):
    """Set value in cache"""
    _cache[key] = value
    _cache_timestamps[key] = time.time()
    logger.info(f"Cache SET: {key}")


@dataclass
class SearchResponse:
    total_hits: int
    page: int
    page_size: int
    total_pages: int
    articles: List[dict]


def search_dynamodb_optimized(
    query: Optional[str],
    published_from: str,
    published_until: str,
    categories: List[str],
    page: int,
    page_size: int
) -> SearchResponse:
    """
    Optimized DynamoDB search using GSI and server-side filtering
    Performance: ~0.5-1s (vs 4.5s before)

    PHASE 71: NO MORE table.scan()!
    When no category specified, query ALL categories via GSI instead of scanning.
    This reduces RCU from ~4,500 to ~1,000 per request.
    """
    # Check cache first
    cache_key = f"search:{query}:{published_from}:{published_until}:{','.join(sorted(categories))}:{page}:{page_size}"
    cached_result = get_cached(cache_key)
    if cached_result:
        return cached_result

    dynamodb = boto3.resource('dynamodb', region_name=settings.region)
    table = dynamodb.Table(settings.dynamodb_table_articles)

    all_items = []
    query_lower = query.lower() if query else ''
    query_original = query if query else ''  # Keep original case for hashtags

    # Strategy: ALWAYS use GSI Query (never scan!)
    # If no categories specified, query ALL categories including aliases
    # PHASE 72: Expand categories to include aliases (e.g., "문화" also queries "문화·라이프")
    if categories:
        # Expand requested categories to include their aliases
        categories_to_query = []
        for cat in categories:
            if cat in CATEGORY_SEARCH_ALIASES:
                categories_to_query.extend(CATEGORY_SEARCH_ALIASES[cat])
            else:
                categories_to_query.append(cat)
        # Remove duplicates while preserving order
        categories_to_query = list(dict.fromkeys(categories_to_query))
    else:
        # Query all standard categories + their aliases
        all_cats = set()
        for aliases in CATEGORY_SEARCH_ALIASES.values():
            all_cats.update(aliases)
        categories_to_query = list(all_cats)

    logger.info(f"Querying {len(categories_to_query)} categories via GSI (NO SCAN): {categories_to_query}")

    for category in categories_to_query:
        items = query_by_category_and_date(
            table,
            category,
            published_from,
            published_until,
            query_lower,
            query_original
        )
        all_items.extend(items)

    logger.info(f"Items found after DynamoDB filtering (before dedup): {len(all_items)}")

    # Remove duplicates by news_id
    # Handles:
    # 1. Category aliases (same article in '문화' and '문화·라이프')
    # 2. Version records (version_XXX_timestamp format)
    def get_original_id(news_id: str) -> str:
        """Extract original news_id from version_XXX_timestamp format"""
        if news_id and news_id.startswith('version_'):
            # version_2K7B9WQC2M_20260115_164048 -> 2K7B9WQC2M
            parts = news_id.split('_')
            if len(parts) >= 2:
                return parts[1]
        return news_id

    # Use dict to keep first occurrence (most recent by query order)
    seen_ids = {}
    for item in all_items:
        news_id = item.get('news_id')
        if not news_id:
            continue
        original_id = get_original_id(news_id)
        if original_id not in seen_ids:
            seen_ids[original_id] = item
    
    all_items = list(seen_ids.values())
    logger.info(f"Items after deduplication: {len(all_items)}")

    # Sort by published_at descending
    all_items.sort(key=lambda x: x.get('published_at', ''), reverse=True)

    # Pagination
    total_hits = len(all_items)
    start_idx = (page - 1) * page_size
    end_idx = start_idx + page_size
    paginated_items = all_items[start_idx:end_idx]

    # Enrich paginated items with S3 body data for new-style articles
    s3_client = S3ArticleClient(
        bucket_name=settings.s3_article_body_bucket,
        region=getattr(settings, 's3_article_body_region', 'us-east-1'),
    )

    for item in paginated_items:
        if item.get('s3_body_uri') and not item.get('content_ko'):
            news_id = item.get('news_id', '')
            body_data = s3_client.get_body(news_id)
            if body_data:
                item.update(body_data)

    # Transform to article format
    articles = []
    for item in paginated_items:
        content_ko = item.get('content_ko', '')
        content_preview = content_ko[:200] if content_ko else ''

        # Extract first image URL from images field
        image_url = None
        images = item.get('images', [])
        if images:
            if isinstance(images, list) and len(images) > 0:
                first_img = images[0]
                if isinstance(first_img, dict):
                    image_url = first_img.get('url', '')
                elif isinstance(first_img, str):
                    image_url = first_img
            elif isinstance(images, str) and images:
                image_url = images.split('\n')[0].strip()

        # Build MBTI version summaries (title + subtitle for cards)
        versions = {}
        for group in ['NT', 'NF', 'ST', 'SF']:
            v = item.get(f'version_{group}')
            if v and isinstance(v, dict):
                versions[group] = {
                    'title': v.get('title', ''),
                    'subtitle': v.get('subtitle', ''),
                    'body': v.get('body', []),
                    'key_points': v.get('key_points', []),
                    'closing_line': v.get('closing_line', ''),
                    'tone': v.get('tone', ''),
                }

        articles.append({
            'news_id': item.get('news_id'),
            'title': item.get('title_ko', ''),
            'sub_title': item.get('sub_title_ko', ''),
            'published_at': item.get('published_at'),
            'updated_at': item.get('updated_at'),
            'provider': item.get('press', '서울경제'),
            'category': item.get('category', 'news'),
            'original_link': item.get('original_link'),
            'content': content_preview,
            'byline': item.get('byline', '서울경제'),
            'image_url': image_url,
            'versions': versions,
        })

    result = SearchResponse(
        total_hits=total_hits,
        page=page,
        page_size=page_size,
        total_pages=math.ceil(total_hits / page_size) if total_hits > 0 else 0,
        articles=articles
    )

    # Cache the result
    set_cached(cache_key, result)

    return result


def query_by_category_and_date(
    table,
    category: str,
    published_from: str,
    published_until: str,
    query_text_lower: str,
    query_text_original: str
) -> List[dict]:
    """
    Query using category-published_at-index GSI
    This is MUCH faster than scanning the entire table
    """
    items = []

    # Build key condition: category = X AND published_at BETWEEN from AND until
    key_condition = Key('category').eq(category) & Key('published_at').between(
        published_from,
        published_until
    )

    # Build filter expression for text search (if needed)
    filter_expression = None
    if query_text_lower and query_text_lower != '*':
        # Search in Korean title, content, and keywords
        filter_expression = (
            Attr('title_ko').contains(query_text_lower) |
            Attr('content_ko').contains(query_text_lower) |
            Attr('keywords').contains(query_text_lower) |
            Attr('hashtags').contains(query_text_original)
        )

    # Execute query
    query_params = {
        'IndexName': 'category-published_at-index',
        'KeyConditionExpression': key_condition,
    }

    if filter_expression:
        query_params['FilterExpression'] = filter_expression

    try:
        response = table.query(**query_params)
        items.extend(response.get('Items', []))

        # Handle pagination
        while 'LastEvaluatedKey' in response:
            query_params['ExclusiveStartKey'] = response['LastEvaluatedKey']
            response = table.query(**query_params)
            items.extend(response.get('Items', []))

        logger.info(f"Category '{category}': Found {len(items)} items")
    except Exception as e:
        logger.error(f"Query error for category '{category}': {e}")

    return items


# =============================================================================
# REMOVED: scan_with_filters() - PHASE 71
# =============================================================================
# The scan_with_filters function has been REMOVED to eliminate table.scan()
# operations that were causing high DynamoDB costs (~$32/day).
#
# Instead, we now query ALL categories via GSI when no category is specified.
# This reduces RCU usage from ~4,500 per request to ~1,000 per request.
#
# See: docs/phases/PHASE-71-dynamodb-cost-analysis-optimization.md
# =============================================================================


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
        response = search_dynamodb_optimized(
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
