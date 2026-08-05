"""
Log repository for DynamoDB operations.
Handles collection logs and system logs.
"""

import logging
from typing import Optional, Dict, Any, List
from datetime import datetime, timezone, timedelta

from boto3.dynamodb.conditions import Attr

from repositories.base import BaseDynamoDBRepository
from config import settings

logger = logging.getLogger(__name__)


class LogRepository(BaseDynamoDBRepository):
    """
    Repository for log-related DynamoDB operations.

    Handles:
    - Collection run logs
    - System logs
    - Error logs
    """

    def __init__(self, table_name: Optional[str] = None, region: Optional[str] = None):
        super().__init__(
            table_name=table_name or settings.dynamodb_table_articles,
            region=region
        )

    async def save_collection_log(self, log_data: Dict[str, Any]) -> bool:
        """
        Save article collection log.

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
            True if saved successfully
        """
        try:
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
                'error': log_data.get('error', ''),
                'duration_seconds': log_data.get('duration_seconds', 0.0),
            }

            # Remove empty values
            item = {k: v for k, v in item.items() if v is not None and v != ''}

            success = await self.put_item(item)

            if success:
                logger.info(f"Collection log saved: {log_id}")

            return success

        except Exception as e:
            logger.error(f"Failed to save collection log: {e}")
            return False

    async def get_collection_logs(self, limit: int = 20) -> List[Dict[str, Any]]:
        """
        Get recent collection logs.

        Args:
            limit: Maximum number of logs to return (default: 20)

        Returns:
            List of collection log entries, sorted by timestamp (newest first)
        """
        try:
            result = await self.scan(
                filter_expression=Attr('item_type').eq('collection_log'),
                limit=limit * 2  # Scan more to ensure enough after filtering
            )

            items = result.get('items', [])

            # Sort by timestamp descending and limit
            items.sort(key=lambda x: x.get('timestamp', ''), reverse=True)
            items = items[:limit]

            logger.info(f"Retrieved {len(items)} collection logs")
            return items

        except Exception as e:
            logger.error(f"Failed to get collection logs: {e}")
            return []

    async def get_collection_log(self, log_id: str) -> Optional[Dict[str, Any]]:
        """
        Get a specific collection log.

        Args:
            log_id: Log ID

        Returns:
            Log dict or None if not found
        """
        return await self.get_item({'news_id': log_id})

    async def get_logs_by_date(
        self,
        date: str,
        item_type: str = 'collection_log'
    ) -> List[Dict[str, Any]]:
        """
        Get logs for a specific date.

        Args:
            date: Date string (YYYY-MM-DD format)
            item_type: Type of log to retrieve

        Returns:
            List of log entries
        """
        try:
            filter_expression = (
                Attr('item_type').eq(item_type) &
                Attr('date').eq(date)
            )

            result = await self.scan(filter_expression=filter_expression)

            items = result.get('items', [])
            items.sort(key=lambda x: x.get('timestamp', ''), reverse=True)

            return items

        except Exception as e:
            logger.error(f"Failed to get logs for date {date}: {e}")
            return []

    async def get_logs_by_status(
        self,
        status: str,
        limit: int = 20
    ) -> List[Dict[str, Any]]:
        """
        Get logs by status.

        Args:
            status: Status filter ('completed', 'failed', 'partial')
            limit: Maximum logs to return

        Returns:
            List of log entries
        """
        try:
            filter_expression = (
                Attr('item_type').eq('collection_log') &
                Attr('status').eq(status)
            )

            result = await self.scan(
                filter_expression=filter_expression,
                limit=limit * 2
            )

            items = result.get('items', [])
            items.sort(key=lambda x: x.get('timestamp', ''), reverse=True)
            items = items[:limit]

            return items

        except Exception as e:
            logger.error(f"Failed to get logs by status {status}: {e}")
            return []

    async def get_collection_stats(self, days: int = 7) -> Dict[str, Any]:
        """
        Get collection statistics for the last N days.

        Args:
            days: Number of days to analyze

        Returns:
            Statistics dict with totals and averages
        """
        try:
            kst = timezone(timedelta(hours=9))
            cutoff_date = (datetime.now(kst) - timedelta(days=days)).strftime('%Y-%m-%d')

            filter_expression = (
                Attr('item_type').eq('collection_log') &
                Attr('date').gte(cutoff_date)
            )

            result = await self.scan(filter_expression=filter_expression)
            logs = result.get('items', [])

            if not logs:
                return {
                    'period_days': days,
                    'total_runs': 0,
                    'total_new': 0,
                    'total_updated': 0,
                    'total_failed': 0,
                    'success_rate': 0.0,
                    'avg_articles_per_run': 0.0
                }

            total_runs = len(logs)
            total_new = sum(l.get('new_articles', 0) for l in logs)
            total_updated = sum(l.get('updated_articles', 0) for l in logs)
            total_failed = sum(l.get('failed_articles', 0) for l in logs)
            successful_runs = sum(1 for l in logs if l.get('status') == 'completed')

            return {
                'period_days': days,
                'total_runs': total_runs,
                'total_new': total_new,
                'total_updated': total_updated,
                'total_failed': total_failed,
                'success_rate': (successful_runs / total_runs * 100) if total_runs > 0 else 0.0,
                'avg_articles_per_run': (total_new + total_updated) / total_runs if total_runs > 0 else 0.0
            }

        except Exception as e:
            logger.error(f"Failed to get collection stats: {e}")
            return {}

    async def delete_old_logs(self, days_to_keep: int = 30) -> int:
        """
        Delete collection logs older than specified days.

        Args:
            days_to_keep: Number of days of logs to keep

        Returns:
            Number of logs deleted
        """
        try:
            kst = timezone(timedelta(hours=9))
            cutoff_date = (datetime.now(kst) - timedelta(days=days_to_keep)).strftime('%Y-%m-%d')

            filter_expression = (
                Attr('item_type').eq('collection_log') &
                Attr('date').lt(cutoff_date)
            )

            result = await self.scan(filter_expression=filter_expression)
            logs = result.get('items', [])

            deleted_count = 0
            for log in logs:
                if await self.delete_item({'news_id': log['news_id']}):
                    deleted_count += 1

            logger.info(f"Deleted {deleted_count} old collection logs (older than {days_to_keep} days)")
            return deleted_count

        except Exception as e:
            logger.error(f"Failed to delete old logs: {e}")
            return 0


# Singleton instance
_log_repository: Optional[LogRepository] = None


def get_log_repository() -> LogRepository:
    """Get or create singleton LogRepository instance."""
    global _log_repository
    if _log_repository is None:
        _log_repository = LogRepository()
    return _log_repository
