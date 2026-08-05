"""
DynamoDB Client
Handles storage and retrieval of MBTI-transformed articles.

Article storage is split between DynamoDB (metadata + pointer) and S3 (body text):
  - DynamoDB stores: news_id, title_ko, category, published_at, images, etc. + s3_body_uri
  - S3 stores: content_ko, content_raw, content_blocks, version_NT/NF/ST/SF

Legacy articles (no s3_body_uri) still have body fields in DynamoDB and are read directly.
"""
import asyncio
import boto3
import logging
from typing import Optional, Dict, Any, TYPE_CHECKING
from datetime import datetime
from decimal import Decimal

from config.constants import S3_BODY_FIELDS

if TYPE_CHECKING:
    from clients.s3_article_client import S3ArticleClient

logger = logging.getLogger(__name__)


def _sanitize_for_dynamodb(obj):
    """Recursively convert float values to Decimal for DynamoDB compatibility."""
    if isinstance(obj, float):
        return Decimal(str(obj))
    elif isinstance(obj, dict):
        return {k: _sanitize_for_dynamodb(v) for k, v in obj.items()}
    elif isinstance(obj, list):
        return [_sanitize_for_dynamodb(v) for v in obj]
    return obj


class DynamoDBClient:
    """
    Client for DynamoDB operations.

    When constructed with an S3ArticleClient, article body content is stored in S3
    and only a pointer (s3_body_uri) is kept in DynamoDB. Without an S3ArticleClient,
    all data is stored directly in DynamoDB (legacy behavior).
    """

    def __init__(
        self,
        table_name: str = "sedaily-mbti-articles-dev",
        region: str = "us-east-1",
        s3_article_client: Optional['S3ArticleClient'] = None,
    ):
        self.table_name = table_name
        self.dynamodb = boto3.resource('dynamodb', region_name=region)
        self.table = self.dynamodb.Table(table_name)
        self._s3_article_client = s3_article_client

    async def get_article(self, news_id: str) -> Optional[Dict[str, Any]]:
        """
        Get full article (metadata + body) with unified retrieval.

        For new articles (with s3_body_uri): fetches metadata from DynamoDB,
        then body from S3, and merges them.
        For legacy articles (no s3_body_uri): returns DynamoDB data as-is,
        which already contains body fields.

        Args:
            news_id: Article ID

        Returns:
            Full article dict with both metadata and body, or None
        """
        metadata = await self.get_article_metadata(news_id)
        if not metadata:
            return None

        s3_body_uri = metadata.get('s3_body_uri')

        # New-style article: body is in S3
        if s3_body_uri and self._s3_article_client:
            body = await asyncio.to_thread(self._s3_article_client.get_body, news_id)
            if body:
                metadata.update(body)
            else:
                logger.warning(
                    f"Article {news_id} has s3_body_uri but S3 body fetch failed; "
                    f"returning metadata only"
                )

        # Legacy article (no s3_body_uri): body fields already in DynamoDB metadata
        return metadata

    async def get_article_metadata(self, news_id: str) -> Optional[Dict[str, Any]]:
        """
        Get article metadata only from DynamoDB (no S3 fetch).

        For new articles this excludes body text. For legacy articles this
        returns everything including body (since it's all in DynamoDB).

        Useful when you only need metadata for listing, search results, etc.

        Args:
            news_id: Article ID

        Returns:
            Article metadata dict, or None
        """
        try:
            response = self.table.get_item(Key={'news_id': news_id})
            return response.get('Item')
        except Exception:
            return None

    async def get_transformed_articles_by_date(self, date_str: str, limit: int = 30) -> list:
        """
        Get all MBTI-transformed articles for a given date.

        Queries ALL 7 categories via the GSI, filters to articles that have
        s3_body_uri (meaning they were transformed by the pipeline), then
        fetches body content from S3 for each article.

        Args:
            date_str: Date in YYYYMMDD format
            limit: Maximum articles to return

        Returns:
            List of article dicts with MBTI versions merged from S3
        """
        import asyncio
        from boto3.dynamodb.conditions import Key
        from config.constants import CATEGORIES_KOREAN

        start = f"{date_str[:4]}-{date_str[4:6]}-{date_str[6:8]}"
        end = f"{start}~"

        def _query_category(category: str) -> list:
            try:
                response = self.table.query(
                    IndexName='category-published_at-index',
                    KeyConditionExpression=(
                        Key('category').eq(category)
                        & Key('published_at').between(start, end)
                    ),
                )
                return response.get('Items', [])
            except Exception as e:
                logger.warning(
                    f"Failed to query category '{category}' for {date_str}: {e}"
                )
                return []

        category_results = await asyncio.gather(
            *(asyncio.to_thread(_query_category, cat) for cat in CATEGORIES_KOREAN)
        )

        seen_ids: set = set()
        articles: list = []
        for items in category_results:
            for item in items:
                nid = item.get('news_id')
                if not nid or nid in seen_ids:
                    continue
                seen_ids.add(nid)
                articles.append(item)

        articles = [a for a in articles if a.get('s3_body_uri')]
        articles.sort(key=lambda a: a.get('published_at', ''), reverse=True)
        articles = articles[:limit]

        if not self._s3_article_client:
            return articles

        semaphore = asyncio.Semaphore(30)

        async def _fetch_body(article: dict) -> dict:
            async with semaphore:
                body = await asyncio.to_thread(
                    self._s3_article_client.get_body, article['news_id']
                )
            if body:
                article.update(body)
            return article

        enriched = await asyncio.gather(*(_fetch_body(a) for a in articles))
        return enriched

    async def get_naver_tv_url(self, published_at: str) -> str:
        """Get Naver TV URL from settings based on publication date"""
        try:
            # Try to get settings from DynamoDB
            response = self.table.get_item(Key={'news_id': 'settings_config'})
            settings = response.get('Item', {})

            if settings:
                effective_date = settings.get('effective_date', '')
                naver_tv_url = settings.get('naver_tv_url', '')

                # Use settings URL if article is published on or after effective date
                if naver_tv_url and effective_date and published_at >= effective_date:
                    return naver_tv_url

            # Fallback to default URL
            return 'https://tv.naver.com/v/90963232?playlistNo=998605'
        except Exception:
            # If settings retrieval fails, use default
            return 'https://tv.naver.com/v/90963232?playlistNo=998605'

    async def save_article(self, article: Dict[str, Any]) -> bool:
        """
        Save MBTI-transformed article.

        When an S3ArticleClient is configured, body fields (content_ko, content_raw,
        content_blocks, version_NT/NF/ST/SF) are stored in S3 and only a pointer
        (s3_body_uri) is kept in DynamoDB. Without S3ArticleClient, all data goes
        to DynamoDB (legacy behavior).

        Args:
            article: Full article dict including both metadata and body fields

        Returns:
            True if saved successfully, False otherwise
        """
        from utils.hash_utils import hash_content

        try:
            news_id = article['news_id']
            published_at = article.get('published_at', '')

            # Generate content hash for change detection
            content_ko = article.get('content_ko', '')
            content_hash = article.get('content_hash', '')
            if not content_hash and content_ko:
                content_hash = hash_content(content_ko)

            # Build the full item with all fields
            item = {
                # Core IDs
                'news_id': news_id,
                'item_type': article.get('item_type', 'article'),
                'action': article.get('action', 'I'),
                'press': article.get('press', '서울경제'),

                # Title (kept in DynamoDB for search/display)
                'title_ko': article.get('title_ko', ''),
                'sub_title_ko': article.get('sub_title_ko', ''),

                # Author
                'author': article.get('author', ''),
                'author_name': article.get('author_name', ''),
                'author_email': article.get('author_email', ''),
                'byline': article.get('byline', '서울경제'),

                # Date/Time
                'date': article.get('date', ''),
                'time': article.get('time', ''),
                'published_at': published_at,
                'updated_at': article.get('updated_at'),

                # Category
                'category': article.get('category', ''),
                'categories': article.get('categories', []),

                # URLs
                'url': article.get('url', ''),
                'original_link': article.get('original_link', ''),

                # Images
                'images': article.get('images', []),
                'images_caption': article.get('images_caption', []),

                # Related news
                'related_news': article.get('related_news', []),

                # Breaking news
                'is_breaking_news': article.get('is_breaking_news', False),

                # Keywords
                'keywords': article.get('keywords', ''),
                'hashtags': article.get('hashtags', ''),

                # Transform tracking
                'transform_usage': article.get('transform_usage', {}),
                'transformed_at': article.get('transformed_at', datetime.utcnow().isoformat()),
                'content_hash': content_hash,
            }

            # Store body in S3 if client is configured
            if self._s3_article_client:
                from clients.s3_article_client import S3ArticleClient

                body_data = S3ArticleClient.extract_body_fields(article)
                if body_data:
                    s3_uri = self._s3_article_client.put_body(news_id, body_data)
                    item['s3_body_uri'] = s3_uri
                    logger.info(f"Article {news_id} body stored in S3: {s3_uri}")
            else:
                # Legacy mode: store body fields directly in DynamoDB
                item['content_ko'] = content_ko
                item['content_raw'] = article.get('content_raw', '')
                item['content_blocks'] = article.get('content_blocks', [])
                item['version_NT'] = article.get('version_NT', {})
                item['version_NF'] = article.get('version_NF', {})
                item['version_ST'] = article.get('version_ST', {})
                item['version_SF'] = article.get('version_SF', {})

            # Copy through any extra fields not explicitly handled above
            # (e.g., collected_at, slug, etc.)
            known_keys = set(item.keys()) | set(S3_BODY_FIELDS)
            for k, v in article.items():
                if k not in known_keys:
                    item[k] = v

            # Remove None values (DynamoDB doesn't accept None)
            item = {k: v for k, v in item.items() if v is not None}

            # Convert float values to Decimal (DynamoDB doesn't accept float)
            item = _sanitize_for_dynamodb(item)

            # Put item
            self.table.put_item(Item=item)

            # Verify it was saved
            verify = self.table.get_item(Key={'news_id': news_id})
            if 'Item' not in verify:
                logger.error(f"Verification failed: Article {news_id} not found after put_item")
                return False

            logger.info(f"Verified save for article {news_id}")
            return True

        except Exception as e:
            logger.error(f"Failed to save article {article.get('news_id')}: {e}", exc_info=True)
            return False
    
    async def article_exists(self, news_id: str) -> bool:
        """Check if article already exists in DynamoDB"""
        metadata = await self.get_article_metadata(news_id)
        return metadata is not None
    
    async def batch_check_exists(self, news_ids: list) -> set:
        """Check which articles exist in DynamoDB (batch operation)"""
        if not news_ids:
            return set()

        existing_ids = set()

        # DynamoDB batch_get_item limit is 100 items
        batch_size = 100
        for i in range(0, len(news_ids), batch_size):
            batch = news_ids[i:i+batch_size]
            keys = [{'news_id': nid} for nid in batch]

            try:
                response = self.dynamodb.batch_get_item(
                    RequestItems={
                        self.table_name: {
                            'Keys': keys,
                            'ProjectionExpression': 'news_id'
                        }
                    }
                )

                items = response.get('Responses', {}).get(self.table_name, [])
                for item in items:
                    existing_ids.add(item['news_id'])

            except Exception as e:
                # Fallback to individual checks if batch fails
                for nid in batch:
                    if await self.article_exists(nid):
                        existing_ids.add(nid)

        return existing_ids

    async def get_recent_articles_with_hash(
        self,
        news_ids: list,
        hours: int = 24
    ) -> Dict[str, Dict[str, Any]]:
        """
        Get recently translated articles with their content hashes.

        Used to check if article content has changed since last translation.
        Only returns articles translated within the specified hours.

        Args:
            news_ids: List of news IDs to check
            hours: Only return articles translated within this many hours (default: 24)

        Returns:
            Dict mapping news_id to article data containing:
            - content_hash: Hash of Korean content (may be None for legacy articles)
            - translated_at: When the article was last translated
            - content_ko: Original Korean content (for comparison if no hash)

        Example:
            >>> articles = await client.get_recent_articles_with_hash(['id1', 'id2'], hours=24)
            >>> articles['id1']['content_hash']
            'a1b2c3d4...'
        """
        import logging
        from datetime import datetime, timedelta, timezone
        logger = logging.getLogger(__name__)

        if not news_ids:
            return {}

        result = {}
        cutoff_time = datetime.now(timezone.utc) - timedelta(hours=hours)
        cutoff_iso = cutoff_time.isoformat()

        # DynamoDB batch_get_item limit is 100 items
        batch_size = 100
        for i in range(0, len(news_ids), batch_size):
            batch = news_ids[i:i+batch_size]
            keys = [{'news_id': nid} for nid in batch]

            try:
                response = self.dynamodb.batch_get_item(
                    RequestItems={
                        self.table_name: {
                            'Keys': keys,
                            'ProjectionExpression': 'news_id, content_hash, translated_at, content_ko'
                        }
                    }
                )

                items = response.get('Responses', {}).get(self.table_name, [])
                for item in items:
                    translated_at = item.get('translated_at', '')

                    # Only include articles translated within the time window
                    if translated_at and translated_at >= cutoff_iso:
                        result[item['news_id']] = {
                            'content_hash': item.get('content_hash'),
                            'translated_at': translated_at,
                            'content_ko': item.get('content_ko', '')
                        }

            except Exception as e:
                logger.warning(f"Failed to batch get articles for hash check: {e}")
                # Fallback to individual gets
                for nid in batch:
                    try:
                        article = await self.get_article(nid)
                        if article:
                            translated_at = article.get('translated_at', '')
                            if translated_at and translated_at >= cutoff_iso:
                                result[nid] = {
                                    'content_hash': article.get('content_hash'),
                                    'translated_at': translated_at,
                                    'content_ko': article.get('content_ko', '')
                                }
                    except Exception:
                        pass

        logger.info(f"Found {len(result)} recent articles (within {hours}h) out of {len(news_ids)} checked")
        return result

    async def batch_get_articles_with_hash(self, news_ids: list) -> Dict[str, Dict[str, Any]]:
        """
        Get articles with their content hashes for change detection.

        Used to check if article content has changed since last translation.
        No time filter - returns all matching articles.

        Args:
            news_ids: List of news IDs to check

        Returns:
            Dict mapping news_id to article data containing:
            - content_hash: Hash of Korean content (may be None for legacy articles)
            - content_ko: Original Korean content (for comparison if no hash)

        Example:
            >>> articles = await client.batch_get_articles_with_hash(['id1', 'id2'])
            >>> articles['id1']['content_hash']
            'a1b2c3d4...'
        """
        import logging
        logger = logging.getLogger(__name__)

        if not news_ids:
            return {}

        result = {}

        # DynamoDB batch_get_item limit is 100 items
        batch_size = 100
        for i in range(0, len(news_ids), batch_size):
            batch = news_ids[i:i+batch_size]
            keys = [{'news_id': nid} for nid in batch]

            try:
                response = self.dynamodb.batch_get_item(
                    RequestItems={
                        self.table_name: {
                            'Keys': keys,
                            'ProjectionExpression': 'news_id, content_hash, content_ko'
                        }
                    }
                )

                items = response.get('Responses', {}).get(self.table_name, [])
                for item in items:
                    result[item['news_id']] = {
                        'content_hash': item.get('content_hash'),
                        'content_ko': item.get('content_ko', '')
                    }

            except Exception as e:
                logger.warning(f"Failed to batch get articles for hash check: {e}")
                # Fallback to individual gets
                for nid in batch:
                    try:
                        article = await self.get_article(nid)
                        if article:
                            result[nid] = {
                                'content_hash': article.get('content_hash'),
                                'content_ko': article.get('content_ko', '')
                            }
                    except Exception:
                        pass

        logger.info(f"Retrieved {len(result)} articles with hash out of {len(news_ids)} requested")
        return result

    async def get_article_by_slug(self, slug: str) -> Optional[Dict[str, Any]]:
        """
        Get article by slug using Global Secondary Index (GSI).

        This method queries the 'slug-index' GSI to retrieve an article by its slug.
        The GSI must be created on the 'slug' attribute for this to work.

        Args:
            slug: SEO-friendly URL slug (e.g., "samsung-q4-earnings-beat-expectations")

        Returns:
            Article dict if found, None otherwise

        Note:
            Requires GSI 'slug-index' to be created on the DynamoDB table.
            AWS CLI command to create GSI:
            ```bash
            aws dynamodb update-table \
              --table-name sedaily-mbti-articles-dev \
              --attribute-definitions AttributeName=slug,AttributeType=S \
              --global-secondary-indexes \
                "[{
                  \"IndexName\": \"slug-index\",
                  \"KeySchema\": [{\"AttributeName\":\"slug\",\"KeyType\":\"HASH\"}],
                  \"Projection\": {\"ProjectionType\":\"ALL\"},
                  \"ProvisionedThroughput\": {\"ReadCapacityUnits\": 5, \"WriteCapacityUnits\": 5}
                }]"
            ```
        """
        import logging
        logger = logging.getLogger(__name__)

        try:
            response = self.table.query(
                IndexName='slug-index',
                KeyConditionExpression='slug = :slug',
                ExpressionAttributeValues={':slug': slug}
            )

            items = response.get('Items', [])

            if not items:
                logger.debug(f"No article found with slug: {slug}")
                return None

            if len(items) > 1:
                logger.warning(f"Multiple articles found with slug: {slug} (count: {len(items)})")

            return items[0]

        except Exception as e:
            logger.error(f"Failed to query article by slug '{slug}': {e}", exc_info=True)
            return None

    async def slug_exists(self, slug: str) -> bool:
        """
        Check if a slug already exists in DynamoDB.

        Used for ensuring slug uniqueness during article creation.

        Args:
            slug: SEO-friendly URL slug to check

        Returns:
            True if slug exists, False otherwise
        """
        article = await self.get_article_by_slug(slug)
        return article is not None

    async def save_collection_log(self, log_data: Dict[str, Any]) -> bool:
        """
        Save article collection log to DynamoDB.

        Stores detailed information about each collection run including:
        - New articles processed
        - Updated articles (with hash change)
        - Skipped articles (unchanged content)
        - Failed articles

        Args:
            log_data: Collection result data containing:
                - total_found: Total articles in XML
                - new_articles: Count of new articles
                - updated_articles: Count of updated articles
                - skipped_unchanged: Count of skipped (hash same)
                - failed_articles: Count of failed
                - article_details: List of article-level details

        Returns:
            True if saved successfully, False otherwise
        """
        import logging
        from datetime import datetime, timezone, timedelta
        logger = logging.getLogger(__name__)

        try:
            # Generate unique log ID with KST timestamp
            kst = timezone(timedelta(hours=9))
            now_kst = datetime.now(kst)
            log_id = f"collection_log_{now_kst.strftime('%Y%m%d_%H%M%S')}"

            item = {
                'news_id': log_id,
                'item_type': 'collection_log',
                'timestamp': now_kst.isoformat(),
                'date': now_kst.strftime('%Y-%m-%d'),
                'time': now_kst.strftime('%H:%M:%S'),
                'total_found': log_data.get('total_found', 0),
                'new_articles': log_data.get('new_articles', 0),
                'updated_articles': log_data.get('updated_articles', 0),
                'skipped_unchanged': log_data.get('skipped_unchanged', 0),
                'deleted_articles': log_data.get('deleted_articles', 0),
                'cached_articles': log_data.get('cached_articles', 0),
                'failed_articles': log_data.get('failed_articles', 0),
                'status': log_data.get('status', 'unknown'),
                'article_details': log_data.get('article_details', []),
                'error': log_data.get('error', '')
            }

            # Remove empty values
            item = {k: v for k, v in item.items() if v is not None and v != ''}

            # Convert float values to Decimal
            item = _sanitize_for_dynamodb(item)

            self.table.put_item(Item=item)
            logger.info(f"Collection log saved: {log_id}")
            return True

        except Exception as e:
            logger.error(f"Failed to save collection log: {e}")
            return False

    async def get_collection_logs(self, limit: int = 20) -> list:
        """
        Get recent collection logs.

        Args:
            limit: Maximum number of logs to return (default: 20)

        Returns:
            List of collection log entries, sorted by timestamp (newest first)
        """
        import logging
        from boto3.dynamodb.conditions import Key, Attr
        logger = logging.getLogger(__name__)

        try:
            # Query logs by item_type
            response = self.table.scan(
                FilterExpression=Attr('item_type').eq('collection_log'),
                Limit=limit * 2  # Scan more to ensure we get enough after filtering
            )

            items = response.get('Items', [])

            # Sort by timestamp descending and limit
            items.sort(key=lambda x: x.get('timestamp', ''), reverse=True)
            items = items[:limit]

            logger.info(f"Retrieved {len(items)} collection logs")
            return items

        except Exception as e:
            logger.error(f"Failed to get collection logs: {e}")
            return []

    # ==================== Article Version History ====================

    async def save_article_version(self, news_id: str, old_article: Dict[str, Any], change_type: str = 'update') -> bool:
        """
        Save a version snapshot of an article before updating.

        Args:
            news_id: The article ID
            old_article: The current article data (before update)
            change_type: Type of change ('update', 'retranslate', 'manual_edit')

        Returns:
            True if saved successfully, False otherwise
        """
        import logging
        from datetime import datetime, timezone, timedelta
        logger = logging.getLogger(__name__)

        try:
            kst = timezone(timedelta(hours=9))
            now_kst = datetime.now(kst)
            version_id = f"version_{news_id}_{now_kst.strftime('%Y%m%d_%H%M%S')}"

            # Extract only essential fields to save space
            version_data = {
                'news_id': version_id,
                'item_type': 'article_version',
                'article_id': news_id,
                'version_timestamp': now_kst.isoformat(),
                'version_date': now_kst.strftime('%Y-%m-%d'),
                'change_type': change_type,
                # Content snapshots
                'title_ko': old_article.get('title_ko', ''),
                'content_ko': old_article.get('content_ko', ''),
                'content_hash': old_article.get('content_hash', ''),
                # MBTI versions snapshot
                'version_NT': old_article.get('version_NT', {}),
                'version_NF': old_article.get('version_NF', {}),
                'version_ST': old_article.get('version_ST', {}),
                'version_SF': old_article.get('version_SF', {}),
                # Metadata
                'category': old_article.get('category', ''),
                'published_at': old_article.get('published_at', ''),
            }

            self.table.put_item(Item=version_data)
            logger.info(f"Article version saved: {version_id}")
            return True

        except Exception as e:
            logger.error(f"Failed to save article version for {news_id}: {e}")
            return False

    async def get_article_versions(self, news_id: str, limit: int = 10) -> list:
        """
        Get version history for an article.

        Args:
            news_id: The article ID
            limit: Maximum number of versions to return

        Returns:
            List of version snapshots, sorted by timestamp (newest first)
        """
        import logging
        from boto3.dynamodb.conditions import Attr
        logger = logging.getLogger(__name__)

        try:
            # Scan for versions of this article
            response = self.table.scan(
                FilterExpression=Attr('item_type').eq('article_version') & Attr('article_id').eq(news_id),
                Limit=limit * 2
            )

            items = response.get('Items', [])

            # Continue scanning if needed
            while 'LastEvaluatedKey' in response and len(items) < limit:
                response = self.table.scan(
                    FilterExpression=Attr('item_type').eq('article_version') & Attr('article_id').eq(news_id),
                    ExclusiveStartKey=response['LastEvaluatedKey'],
                    Limit=limit * 2
                )
                items.extend(response.get('Items', []))

            # Sort by timestamp descending
            items.sort(key=lambda x: x.get('version_timestamp', ''), reverse=True)
            items = items[:limit]

            logger.info(f"Retrieved {len(items)} versions for article {news_id}")
            return items

        except Exception as e:
            logger.error(f"Failed to get article versions for {news_id}: {e}")
            return []

    async def get_article_version_detail(self, version_id: str) -> Optional[Dict[str, Any]]:
        """
        Get a specific version snapshot.

        Args:
            version_id: The version ID

        Returns:
            Version data or None if not found
        """
        try:
            response = self.table.get_item(Key={'news_id': version_id})
            return response.get('Item')
        except Exception:
            return None

    # ==================== News Briefing (Chatbot Context Cache) ====================

    async def save_news_briefing(self, briefing_data: Dict[str, Any]) -> bool:
        """
        Save the generated news briefing to DynamoDB.
        Overwrites the previous briefing (fixed key: news_briefing_latest).
        """
        import logging
        from config.constants import NEWS_BRIEFING_ID, ITEM_TYPE_NEWS_BRIEFING
        logger = logging.getLogger(__name__)

        try:
            item = {
                'news_id': NEWS_BRIEFING_ID,
                'item_type': ITEM_TYPE_NEWS_BRIEFING,
                **briefing_data,
            }

            item = {k: v for k, v in item.items() if v is not None}
            item = _sanitize_for_dynamodb(item)

            self.table.put_item(Item=item)
            logger.info(f"News briefing saved: {item.get('generated_at', 'unknown')}")
            return True

        except Exception as e:
            logger.error(f"Failed to save news briefing: {e}", exc_info=True)
            return False

    async def get_news_briefing(self) -> Optional[Dict[str, Any]]:
        """
        Get the cached news briefing (single get_item, very fast).
        Returns None if not found.
        """
        import logging
        from config.constants import NEWS_BRIEFING_ID
        logger = logging.getLogger(__name__)

        try:
            response = self.table.get_item(Key={'news_id': NEWS_BRIEFING_ID})
            return response.get('Item')
        except Exception as e:
            logger.warning(f"Failed to fetch news briefing: {e}")
            return None

    # ==================== Failed Articles Queue ====================

    async def save_failed_article(self, article_data: Dict[str, Any], error_reason: str) -> bool:
        """
        Save a failed article to the retry queue.

        When translation fails (e.g., API overload), the article is saved here
        to be retried in the next collection cycle.

        Args:
            article_data: Original article data from S3 XML (serializable format)
            error_reason: Reason for failure (e.g., "HTTP 529", "Translation timeout")

        Returns:
            True if saved successfully, False otherwise
        """
        import logging
        from datetime import datetime, timezone, timedelta
        logger = logging.getLogger(__name__)

        try:
            kst = timezone(timedelta(hours=9))
            now_kst = datetime.now(kst)
            news_id = article_data.get('nsid') or article_data.get('news_id', 'unknown')
            queue_id = f"failed_queue_{news_id}"

            item = {
                'news_id': queue_id,
                'item_type': 'failed_article',
                'original_news_id': news_id,
                'article_data': article_data,
                'error_reason': error_reason,
                'failed_at': now_kst.isoformat(),
                'retry_count': article_data.get('retry_count', 0) + 1,
                'date': article_data.get('date', now_kst.strftime('%Y%m%d')),
            }

            item = _sanitize_for_dynamodb(item)
            self.table.put_item(Item=item)
            logger.info(f"Failed article queued for retry: {news_id} (reason: {error_reason})")
            return True

        except Exception as e:
            logger.error(f"Failed to queue article {article_data.get('nsid', 'unknown')}: {e}")
            return False

    async def get_failed_articles(self, limit: int = 50) -> list:
        """
        Get failed articles from the retry queue.

        Returns articles that failed translation and need to be retried.
        Articles are returned sorted by failed_at (oldest first) to ensure
        FIFO processing.

        Args:
            limit: Maximum number of articles to return (default: 50)

        Returns:
            List of failed article entries with their original data
        """
        import logging
        from boto3.dynamodb.conditions import Attr
        logger = logging.getLogger(__name__)

        try:
            response = self.table.scan(
                FilterExpression=Attr('item_type').eq('failed_article'),
                Limit=limit * 2
            )

            items = response.get('Items', [])

            # Continue scanning if needed
            while 'LastEvaluatedKey' in response and len(items) < limit:
                response = self.table.scan(
                    FilterExpression=Attr('item_type').eq('failed_article'),
                    ExclusiveStartKey=response['LastEvaluatedKey'],
                    Limit=limit * 2
                )
                items.extend(response.get('Items', []))

            # Sort by failed_at (oldest first - FIFO)
            items.sort(key=lambda x: x.get('failed_at', ''))
            items = items[:limit]

            logger.info(f"Retrieved {len(items)} failed articles from queue")
            return items

        except Exception as e:
            logger.error(f"Failed to get failed articles queue: {e}")
            return []

    async def delete_failed_article(self, news_id: str) -> bool:
        """
        Remove a failed article from the retry queue after successful processing.

        Args:
            news_id: Original news ID (not the queue_id)

        Returns:
            True if deleted successfully, False otherwise
        """
        import logging
        logger = logging.getLogger(__name__)

        try:
            queue_id = f"failed_queue_{news_id}"
            self.table.delete_item(Key={'news_id': queue_id})
            logger.info(f"Removed article from failed queue: {news_id}")
            return True

        except Exception as e:
            logger.error(f"Failed to remove article from queue {news_id}: {e}")
            return False

    async def get_failed_article_count(self) -> int:
        """
        Get the count of failed articles in the queue.

        Returns:
            Number of articles waiting for retry
        """
        import logging
        from boto3.dynamodb.conditions import Attr
        logger = logging.getLogger(__name__)

        try:
            response = self.table.scan(
                FilterExpression=Attr('item_type').eq('failed_article'),
                Select='COUNT'
            )
            count = response.get('Count', 0)
            logger.info(f"Failed articles in queue: {count}")
            return count

        except Exception as e:
            logger.error(f"Failed to count failed articles: {e}")
            return 0
