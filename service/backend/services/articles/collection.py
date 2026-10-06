"""Article Collector 비즈니스 로직 — S3 XML 기사를 수집해 PostgreSQL에 저장한다.

- 원천: s3://sedaily-news-xml-storage/daily-xml/
- 저장: PostgreSQL(lens-cms-api 경유). EventBridge 크론이 매일 23시 KST에 실행한다.
- 수집 실행 로그는 대응 테이블이 없어 CloudWatch 로그로만 남긴다.
- `batch_get_hash`가 published_at을 반환하지 않으므로 original_published_at 보존 로직은 실질적으로 동작하지 않는다
  (lens-cms-api/articles_repo.py::batch_get_hash 참조).
"""
import logging
from datetime import datetime, timedelta, timezone
from typing import Dict, Any

import clients.pg.articles as articles_client
from clients.s3.xml_articles import S3XMLClient
from common.hash_utils import hash_content, content_changed

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

# 1회 실행당 저장할 최대 기사 수
BATCH_SIZE = 50


def _build_article_data(article, original_published_at: Dict[str, str]) -> Dict[str, Any]:
    """S3XMLClient가 파싱한 article을 저장용 dict로 변환한다."""
    category = article.main_category or 'news'
    return {
        'news_id': article.nsid,
        'item_type': 'article',
        'action': article.action,
        'press': article.press,

        'title_ko': article.title,
        'sub_title_ko': article.sub_title or '',
        'content_ko': article.content_clean,
        'content_raw': article.content_raw,

        'author': article.author,
        'author_name': article.author_name,
        'author_email': article.author_email,
        'byline': article.author_name or '서울경제',

        'date': article.date,
        'time': article.time,
        'published_at': original_published_at.get(article.nsid, article.published_at),
        'updated_at': article.published_at if article.nsid in original_published_at else None,

        'category': category,
        'categories': [
            {'code': c.code, 'name': c.name, 'main': c.main_category,
             'sub': c.sub_category, 'detail': c.detail_category}
            for c in article.categories
        ],

        'url': article.url,
        'original_link': article.url,

        'images': [
            {'url': img.url, 'width': img.width, 'height': img.height,
             'caption_title': img.caption_title, 'caption_content': img.caption_content}
            for img in article.images
        ],

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

        'related_news': [
            {'title': rel.title, 'url': rel.url, 'nsid': rel.nsid}
            for rel in article.related_news
        ],

        'is_breaking_news': article.is_breaking_news,

        'content_hash': hash_content(article.content_clean),

        'collected_at': datetime.now().isoformat(),
    }


async def collect_articles(hours: int = 24, event: dict = None) -> Dict[str, Any]:
    """S3 XML에서 신규·변경 기사를 골라 PostgreSQL에 저장한다."""
    try:
        s3_xml_client = S3XMLClient(
            bucket_name="sedaily-news-xml-storage",
            prefix="daily-xml",
            region="ap-northeast-2"
        )

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

        # 신규 기사 중복 제거
        new_article_ids = [a.nsid for a in new_articles_xml]
        existing_ids = articles_client.batch_check_exists(new_article_ids)
        articles_to_save = [a for a in new_articles_xml if a.nsid not in existing_ids]

        # 갱신 기사는 본문 해시로 실제 변경 여부 확인
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

        new_articles_count = 0
        updated_articles_count = 0
        failed_articles = 0
        article_details = []
        updated_ids_set = set(a.nsid for a in updated_articles_xml)

        for idx, article in enumerate(articles_to_save):
            try:
                if not article.content_clean or not article.content_clean.strip():
                    logger.info(f"Skipping article {article.nsid} - no content")
                    continue

                logger.info(f"Saving article {article.nsid}: {article.title[:50]}...")

                category = article.main_category or 'news'
                article_data = _build_article_data(article, original_published_at)

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
    """수집 실행 결과를 CloudWatch 로그로 남긴다."""
    logger.info(f"Collection log: {result}")
