"""
MBTI Article Collector Lambda Function
Collects Seoul Economic articles from S3 XML and saves them to DynamoDB.

Data Source: S3 XML (s3://sedaily-news-xml-storage/daily-xml/)
Storage: DynamoDB (sedaily-mbti-articles-dev)

PHASE 73: Smart Article Filtering
- Articles are filtered by category to exclude unsuitable content
- Exclusion criteria: 속보, 사건/사고, 인사발령, 부고, 반복성 기사
- Only quality articles are transformed with MBTI

MBTI transformation is applied to filtered TOP articles per category.
"""
import logging
import asyncio
from datetime import datetime, timedelta, timezone
from typing import Dict, Any, List
from collections import defaultdict

from clients.s3_xml_client import S3XMLClient
from clients.dynamodb_client import DynamoDBClient
from clients.mbti_transform_service import MbtiTransformService
from services.article_filter_service import ArticleFilterService
from config import settings
from config.constants import CATEGORIES_KOREAN
from utils.hash_utils import hash_content, content_changed

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# Batch size for saving articles
BATCH_SIZE = 50

# Number of articles to transform with MBTI per category
TRANSFORM_PER_CATEGORY = {
    '경제': 3,
    'IT_과학': 2,
    '정치': 1,
    '사회': 2,
    '문화': 1,
    '스포츠': 1,
    '국제': 1,
}
# Total: 11 articles max

# Legacy limit (fallback)
TRANSFORM_LIMIT = 10


async def collect_articles(hours: int = 24, event: dict = None) -> Dict[str, Any]:
    """
    Collect articles from S3 XML and save to DynamoDB.

    Flow:
    1. Fetch today's XML from S3
    2. Filter new/updated articles
    3. Transform TOP 10 articles with MBTI styles
    4. Save all articles (transformed + original only) to DynamoDB
    """
    dynamodb_client = None
    transform_service = None

    try:
        # Initialize clients
        s3_xml_client = S3XMLClient(
            bucket_name="sedaily-news-xml-storage",
            prefix="daily-xml",
            region="ap-northeast-2"
        )

        dynamodb_client = DynamoDBClient(
            table_name=settings.dynamodb_table_articles,
            region=settings.region
        )

        transform_service = MbtiTransformService(region=settings.region)

        # ==================== Process Articles ====================
        # event.target_date (YYYYMMDD)로 특정 날짜 백필 지원; 없으면 오늘 KST 기준
        kst = timezone(timedelta(hours=9))
        target_date = (event or {}).get("target_date") or datetime.now(kst).strftime("%Y%m%d")

        logger.info(f"Fetching articles from S3 XML for date: {target_date}")

        articles_by_action = await s3_xml_client.get_articles_to_process(target_date)

        new_articles_xml = articles_by_action['new']
        updated_articles_xml = articles_by_action['updated']
        deleted_articles_xml = articles_by_action['deleted']

        total_found = len(new_articles_xml) + len(updated_articles_xml) + len(deleted_articles_xml)
        logger.info(f"S3 XML - New: {len(new_articles_xml)}, Updated: {len(updated_articles_xml)}, Deleted: {len(deleted_articles_xml)}")

        if total_found == 0:
            return {
                "status": "success", "total_found": 0,
                "new_articles": 0, "updated_articles": 0, "failed_articles": 0,
                "collection_time": datetime.now().isoformat(),
                "mode": "on-demand"
            }

        # Check duplicates
        new_article_ids = [a.nsid for a in new_articles_xml]
        existing_ids = await dynamodb_client.batch_check_exists(new_article_ids)
        articles_to_save = [a for a in new_articles_xml if a.nsid not in existing_ids]

        # Check updated articles for content changes
        updated_ids = [a.nsid for a in updated_articles_xml]
        actually_changed_count = 0
        skipped_unchanged_count = 0
        original_published_at = {}

        if updated_ids:
            existing_articles = await dynamodb_client.batch_get_articles_with_hash(updated_ids)

            for article in updated_articles_xml:
                existing = existing_articles.get(article.nsid)
                if existing and existing.get('published_at'):
                    original_published_at[article.nsid] = existing.get('published_at')

                if existing:
                    old_hash = existing.get('content_hash')
                    if content_changed(old_hash, article.content_clean or ''):
                        articles_to_save.append(article)
                        actually_changed_count += 1
                    else:
                        skipped_unchanged_count += 1
                else:
                    articles_to_save.append(article)
                    actually_changed_count += 1

        # Limit batch size
        total_pending = len(articles_to_save)
        if total_pending > BATCH_SIZE:
            logger.info(f"Limiting batch from {total_pending} to {BATCH_SIZE} articles")
            articles_to_save = articles_to_save[:BATCH_SIZE]

        logger.info(f"Saving {len(articles_to_save)} articles (pending: {total_pending - len(articles_to_save)})")

        if not articles_to_save:
            return {
                "status": "success", "total_found": total_found,
                "new_articles": 0, "updated_articles": 0,
                "cached_articles": len(existing_ids), "failed_articles": 0,
                "collection_time": datetime.now().isoformat(),
                "message": "No new or changed articles to process",
                "mode": "on-demand"
            }

        # ==================== PHASE 73: Smart Article Filtering ====================
        # Group articles by category
        articles_by_category = defaultdict(list)
        for article in articles_to_save:
            category = article.main_category or 'news'
            articles_by_category[category].append(article)

        logger.info(f"Articles by category: {dict((k, len(v)) for k, v in articles_by_category.items())}")

        # Filter and select articles for transformation
        filter_service = ArticleFilterService()
        articles_to_transform = []
        filter_stats = {"total_before": 0, "total_after": 0, "excluded": 0}

        for category, cat_articles in articles_by_category.items():
            filter_stats["total_before"] += len(cat_articles)

            # Filter articles for this category
            filtered_articles, filter_results = await filter_service.filter_articles(
                cat_articles, category
            )

            # Get transform limit for this category
            transform_limit = TRANSFORM_PER_CATEGORY.get(category, 1)

            # Select top articles from filtered list (by recency)
            selected = filtered_articles[:transform_limit]
            articles_to_transform.extend(selected)

            filter_stats["total_after"] += len(filtered_articles)
            filter_stats["excluded"] += len(cat_articles) - len(filtered_articles)

            logger.info(
                f"Category '{category}': {len(cat_articles)} -> {len(filtered_articles)} filtered -> {len(selected)} selected for transform"
            )

        logger.info(f"Filter stats: {filter_stats}")
        logger.info(f"Total articles to transform: {len(articles_to_transform)}")

        # Create set of articles to transform for quick lookup
        transform_ids = set(a.nsid for a in articles_to_transform)

        # ==================== End PHASE 73 ====================

        # Counters
        new_articles_count = 0
        updated_articles_count = 0
        failed_articles = 0
        transformed_count = 0
        article_details = []
        updated_ids_set = set(a.nsid for a in updated_articles_xml)

        # Process each article
        for idx, article in enumerate(articles_to_save):
            try:
                if not article.content_clean or not article.content_clean.strip():
                    logger.info(f"Skipping article {article.nsid} - no content")
                    continue

                logger.info(f"Saving article {article.nsid}: {article.title[:50]}...")

                category = article.main_category or 'news'

                # Build article data for DynamoDB (WITHOUT MBTI versions)
                article_data = {
                    # IDs
                    'news_id': article.nsid,
                    'item_type': 'article',
                    'action': article.action,
                    'press': article.press,

                    # Original content
                    'title_ko': article.title,
                    'sub_title_ko': article.sub_title or '',
                    'content_ko': article.content_clean,
                    'content_raw': article.content_raw,

                    # MBTI versions - empty, will be filled on-demand
                    # version_NT, version_NF, version_ST, version_SF will be added when user views

                    # Author
                    'author': article.author,
                    'author_name': article.author_name,
                    'author_email': article.author_email,
                    'byline': article.author_name or '서울경제',

                    # Date/Time
                    'date': article.date,
                    'time': article.time,
                    'published_at': original_published_at.get(article.nsid, article.published_at),
                    'updated_at': article.published_at if article.nsid in original_published_at else None,

                    # Category
                    'category': category,
                    'categories': [
                        {'code': c.code, 'name': c.name, 'main': c.main_category,
                         'sub': c.sub_category, 'detail': c.detail_category}
                        for c in article.categories
                    ],

                    # URL
                    'url': article.url,
                    'original_link': article.url,

                    # Images
                    'images': [
                        {'url': img.url, 'width': img.width, 'height': img.height,
                         'caption_title': img.caption_title, 'caption_content': img.caption_content}
                        for img in article.images
                    ],

                    # Content blocks (original structure preserved)
                    'content_blocks': [
                        {
                            'type': 'text',
                            'text_ko': block.text_ko,
                            'style': block.style
                        } if block.block_type == "text" else
                        {
                            'type': 'image',
                            'url': block.image_url,
                            'alt': block.image_alt,
                            'width': block.image_width,
                            'caption': block.image_caption,
                        }
                        for block in article.content_blocks
                    ],

                    # Related news
                    'related_news': [
                        {'title': rel.title, 'url': rel.url, 'nsid': rel.nsid}
                        for rel in article.related_news
                    ],

                    # Breaking news
                    'is_breaking_news': article.is_breaking_news,

                    # Content hash for change detection
                    'content_hash': hash_content(article.content_clean),

                    # Collected timestamp
                    'collected_at': datetime.now().isoformat(),
                }

                # PHASE 73: Transform only filtered & selected articles
                if article.nsid in transform_ids and transform_service:
                    try:
                        logger.info(f"Transforming filtered article [{category}]: {article.nsid}")
                        result = await transform_service.transform_article(
                            title=article.title,
                            subtitle=article.sub_title or '',
                            content=article.content_clean,
                            category=category,
                        )
                        versions = result['versions']
                        usage = result['usage']

                        # Add MBTI versions to article data
                        article_data['version_NT'] = versions.get('NT', {})
                        article_data['version_NF'] = versions.get('NF', {})
                        article_data['version_ST'] = versions.get('ST', {})
                        article_data['version_SF'] = versions.get('SF', {})
                        article_data['transformed_at'] = datetime.now().isoformat()
                        article_data['transform_usage'] = usage

                        transformed_count += 1
                        logger.info(f"Transformed article {article.nsid} successfully")

                    except Exception as transform_error:
                        logger.warning(f"Transform failed for {article.nsid}: {transform_error}")
                        # Continue without transformation - article will be saved without MBTI versions

                # Save to DynamoDB
                saved = await dynamodb_client.save_article(article_data)

                if saved:
                    if article.nsid in updated_ids_set:
                        updated_articles_count += 1
                        article_details.append({
                            'news_id': article.nsid,
                            'title': article.title[:50],
                            'action': 'updated',
                            'category': category
                        })
                    else:
                        new_articles_count += 1
                        article_details.append({
                            'news_id': article.nsid,
                            'title': article.title[:50],
                            'action': 'new',
                            'category': category
                        })
                    logger.info(f"Saved article {article.nsid} (on-demand transform pending)")
                else:
                    failed_articles += 1
                    article_details.append({
                        'news_id': article.nsid,
                        'title': article.title[:50],
                        'action': 'failed',
                        'reason': 'db_save_failed'
                    })

            except Exception as e:
                failed_articles += 1
                logger.error(f"Failed to save article {article.nsid}: {e}", exc_info=True)
                article_details.append({
                    'news_id': article.nsid,
                    'title': article.title[:50] if article.title else '',
                    'action': 'failed',
                    'reason': str(e)[:100]
                })
                continue

        pending_remaining = total_pending - len(articles_to_save)

        result = {
            "status": "success",
            "mode": "smart-filter-transform",
            "total_found": total_found,
            "new_articles": new_articles_count,
            "updated_articles": updated_articles_count,
            "transformed_articles": transformed_count,
            "filter_stats": filter_stats,
            "transform_per_category": TRANSFORM_PER_CATEGORY,
            "skipped_unchanged": skipped_unchanged_count,
            "cached_articles": len(existing_ids),
            "failed_articles": failed_articles,
            "pending_remaining": pending_remaining,
            "batch_size": BATCH_SIZE,
            "collection_time": datetime.now().isoformat(),
            "article_details": article_details,
            "note": "Smart filtered: excluded 속보/사건/인사/부고, selected quality articles per category"
        }

        # Save collection log
        try:
            await dynamodb_client.save_collection_log(result)
        except Exception as e:
            logger.error(f"Failed to save collection log: {e}")

        logger.info(f"Article collection complete: {result}")
        return result

    except Exception as e:
        logger.error(f"Collection failed: {e}", exc_info=True)
        error_result = {
            "status": "error",
            "error": str(e),
            "collection_time": datetime.now().isoformat()
        }
        if dynamodb_client:
            try:
                await dynamodb_client.save_collection_log(error_result)
            except Exception as log_e:
                logger.error(f"Failed to save error log: {log_e}")
        return error_result


def lambda_handler(event: dict, context) -> dict:
    """
    AWS Lambda handler for scheduled article collection.
    Triggered by EventBridge on schedule.
    """
    logger.info(f"Article collection triggered: {event}")
    result = asyncio.run(collect_articles(24, event=event))
    # Reflect collection failure in the HTTP status so any non-EventBridge
    # caller (or future API Gateway wiring) can detect it. Previously this
    # always returned 200 even when `collect_articles` had raised internally
    # and produced `{"status": "error", ...}`.
    status_code = 500 if isinstance(result, dict) and result.get("status") == "error" else 200
    return {
        "statusCode": status_code,
        "body": result,
    }
