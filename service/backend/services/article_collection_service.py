"""Article Collector 비즈니스 로직 — handlers/article_collector.py에서 추출
(2026-08-24, 코드 리팩토링 감사 Track B, God 파일 분해).

Collects Seoul Economic articles from S3 XML and saves them to PostgreSQL.

Data Source: S3 XML (s3://sedaily-news-xml-storage/daily-xml/)
Storage: PostgreSQL (v1.25 — lens-cms-api 경유, EventBridge 크론이 매일
23시 KST에 이 함수를 실행)

2026-09-09(v1.25): DynamoDB → PostgreSQL 전환. `save_collection_log`는
Postgres에 대응 테이블이 없어(수집 실행 로그, 낮은 가치의 관측용 데이터라
새 인프라를 만들 만큼 우선순위가 아니라고 판단) CloudWatch 로그만 남기는
스텁으로 대체했다.

⚠️ `batch_get_hash`가 published_at을 반환하지 않는다(DynamoDB 쪽도 원래
안 넣었다 — article_collection_service.py의 original_published_at 보존
로직은 발견된 죽은 코드, 이번 전환에서 그 동작을 그대로 보존했다. 상세는
lens-cms-api/articles_repo.py::batch_get_hash 주석 참조)."""
import logging
from datetime import datetime, timedelta, timezone
from typing import Dict, Any

import clients.pg.articles as articles_client
from clients.s3.xml_articles import S3XMLClient
from utils.hash_utils import hash_content, content_changed

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# Batch size for saving articles
BATCH_SIZE = 50


def _build_article_data(article, original_published_at: Dict[str, str]) -> Dict[str, Any]:
    """S3XMLClient가 파싱한 article → DynamoDB 저장 형태로 변환."""
    category = article.main_category or 'news'
    return {
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


async def collect_articles(hours: int = 24, event: dict = None) -> Dict[str, Any]:
    """
    Collect articles from S3 XML and save to PostgreSQL.

    Flow:
    1. Fetch today's XML from S3
    2. Filter new/updated articles
    3. Save all articles to PostgreSQL
    """
    try:
        # Initialize clients
        s3_xml_client = S3XMLClient(
            bucket_name="sedaily-news-xml-storage",
            prefix="daily-xml",
            region="ap-northeast-2"
        )

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
        existing_ids = articles_client.batch_check_exists(new_article_ids)
        articles_to_save = [a for a in new_articles_xml if a.nsid not in existing_ids]

        # Check updated articles for content changes
        updated_ids = [a.nsid for a in updated_articles_xml]
        actually_changed_count = 0
        skipped_unchanged_count = 0
        original_published_at = {}

        if updated_ids:
            existing_articles = articles_client.batch_get_hash(updated_ids)

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

        # Counters
        new_articles_count = 0
        updated_articles_count = 0
        failed_articles = 0
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
                article_data = _build_article_data(article, original_published_at)

                # Save to PostgreSQL
                saved = articles_client.save_article(article.nsid, article_data)

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
                    logger.info(f"Saved article {article.nsid}")
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
            "mode": "collect",
            "total_found": total_found,
            "new_articles": new_articles_count,
            "updated_articles": updated_articles_count,
            "skipped_unchanged": skipped_unchanged_count,
            "cached_articles": len(existing_ids),
            "failed_articles": failed_articles,
            "pending_remaining": pending_remaining,
            "batch_size": BATCH_SIZE,
            "collection_time": datetime.now().isoformat(),
            "article_details": article_details,
        }

        _log_collection_result(result)

        logger.info(f"Article collection complete: {result}")
        return result

    except Exception as e:
        logger.error(f"Collection failed: {e}", exc_info=True)
        error_result = {
            "status": "error",
            "error": str(e),
            "collection_time": datetime.now().isoformat()
        }
        _log_collection_result(error_result)
        return error_result


def _log_collection_result(result: Dict[str, Any]) -> None:
    """수집 실행 로그 — v1.25에서 Postgres에 대응 테이블 없이 CloudWatch
    로그로만 남기기로 결정(관측용 데이터, 우선순위 낮음)."""
    logger.info(f"Collection log: {result}")
