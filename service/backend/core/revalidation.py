"""
Cache revalidation utilities for triggering frontend cache invalidation.
Extracted from admin_handler.py and cms_update_handler.py to eliminate duplication.
"""

import logging
import os
from typing import Dict, List, Any, Optional, Set

from config.constants import (
    FRONTEND_URL_DEFAULT,
    HTTP_TIMEOUT_SHORT,
)

logger = logging.getLogger(__name__)

# Lazy import requests to handle optional dependency
_requests = None


def _get_requests():
    """Lazy load requests library."""
    global _requests
    if _requests is None:
        try:
            import requests
            _requests = requests
        except ImportError:
            logger.warning("requests library not available - cache revalidation will be disabled")
    return _requests


class CacheRevalidator:
    """
    Handles cache revalidation for the frontend application.
    Triggers ISR revalidation endpoints after article updates.
    """

    def __init__(
        self,
        frontend_url: Optional[str] = None,
        revalidate_secret: Optional[str] = None
    ):
        """
        Initialize CacheRevalidator.

        Args:
            frontend_url: Frontend base URL (default: from environment)
            revalidate_secret: Secret for revalidation endpoint (default: from environment)
        """
        self.frontend_url = frontend_url or os.getenv('FRONTEND_URL', FRONTEND_URL_DEFAULT)
        self.revalidate_secret = revalidate_secret or os.getenv('REVALIDATE_SECRET')
        self._requests = None

    @property
    def requests(self):
        """Get requests library instance."""
        if self._requests is None:
            self._requests = _get_requests()
        return self._requests

    def is_available(self) -> bool:
        """Check if revalidation is available (requests library and secret configured)."""
        return self.requests is not None and self.revalidate_secret is not None

    def revalidate_article(self, article: Dict[str, Any]) -> bool:
        """
        Trigger cache revalidation for a single article.

        Args:
            article: Article dictionary containing news_id, category, slug, published_at

        Returns:
            True if revalidation successful, False otherwise
        """
        if not self.requests:
            logger.warning("requests library not available - skipping revalidation")
            return False

        if not self.revalidate_secret:
            logger.warning("REVALIDATE_SECRET not configured - skipping revalidation")
            return False

        try:
            response = self.requests.post(
                f"{self.frontend_url}/api/revalidate",
                headers={
                    'x-revalidate-secret': self.revalidate_secret,
                    'Content-Type': 'application/json'
                },
                json={
                    'type': 'article',
                    'category': article.get('category'),
                    'slug': article.get('slug'),
                    'publishedAt': article.get('published_at')
                },
                timeout=HTTP_TIMEOUT_SHORT
            )

            if response.ok:
                logger.info(f"Cache revalidation successful for article: {article.get('news_id')}")
                result = response.json()
                logger.info(f"Revalidated paths: {result.get('paths', [])}")
                return True
            else:
                logger.warning(f"Cache revalidation failed: {response.status_code} - {response.text}")
                return False

        except Exception as e:
            logger.warning(f"Cache revalidation error: {e}")
            return False

    def revalidate_path(self, path: str) -> bool:
        """
        Trigger cache revalidation for a specific path.

        Args:
            path: Path to revalidate (e.g., '/', '/finance')

        Returns:
            True if revalidation successful, False otherwise
        """
        if not self.requests:
            logger.warning("requests library not available - skipping revalidation")
            return False

        if not self.revalidate_secret:
            logger.warning("REVALIDATE_SECRET not configured - skipping revalidation")
            return False

        try:
            response = self.requests.post(
                f"{self.frontend_url}/api/revalidate",
                headers={
                    'x-revalidate-secret': self.revalidate_secret,
                    'Content-Type': 'application/json'
                },
                json={'path': path},
                timeout=HTTP_TIMEOUT_SHORT
            )

            if response.ok:
                logger.info(f"Cache revalidation successful for path: {path}")
                return True
            else:
                logger.warning(f"Cache revalidation failed for path {path}: {response.status_code}")
                return False

        except Exception as e:
            logger.warning(f"Cache revalidation error for path {path}: {e}")
            return False

    def revalidate_bulk(
        self,
        articles: List[Dict[str, Any]],
        max_articles: int = 20
    ) -> Dict[str, Any]:
        """
        Trigger bulk cache revalidation for multiple articles.

        Args:
            articles: List of article dictionaries
            max_articles: Maximum number of articles to revalidate (default: 20)

        Returns:
            Dictionary with success status and revalidated paths
        """
        if not self.requests:
            logger.warning("requests library not available - skipping bulk revalidation")
            return {'success': False, 'error': 'requests not available'}

        if not self.revalidate_secret:
            logger.warning("REVALIDATE_SECRET not configured - skipping bulk revalidation")
            return {'success': False, 'error': 'REVALIDATE_SECRET not configured'}

        revalidated_paths: List[str] = []

        try:
            # 1. Revalidate home page
            if self.revalidate_path('/'):
                revalidated_paths.append('/')

            # 2. Revalidate each unique article page (limit for performance)
            unique_articles = self._deduplicate_articles(articles, max_articles)

            for article in unique_articles:
                try:
                    response = self.requests.post(
                        f"{self.frontend_url}/api/revalidate",
                        headers={
                            'x-revalidate-secret': self.revalidate_secret,
                            'Content-Type': 'application/json'
                        },
                        json={
                            'type': 'article',
                            'category': article.get('category'),
                            'slug': article.get('slug'),
                            'publishedAt': article.get('published_at')
                        },
                        timeout=5  # Shorter timeout for bulk operations
                    )
                    if response.ok:
                        result = response.json()
                        revalidated_paths.extend(result.get('paths', []))
                except Exception as e:
                    logger.warning(f"Failed to revalidate article {article.get('slug')}: {e}")

            logger.info(f"Bulk revalidation completed: {len(revalidated_paths)} paths")
            return {
                'success': True,
                'revalidated_paths': revalidated_paths,
                'articles_processed': len(unique_articles)
            }

        except Exception as e:
            logger.error(f"Bulk revalidation error: {e}")
            return {'success': False, 'error': str(e)}

    def _deduplicate_articles(
        self,
        articles: List[Dict[str, Any]],
        max_count: int
    ) -> List[Dict[str, Any]]:
        """
        Remove duplicate articles by slug and limit count.

        Args:
            articles: List of article dictionaries
            max_count: Maximum number of unique articles to return

        Returns:
            List of unique articles limited to max_count
        """
        unique_articles: List[Dict[str, Any]] = []
        seen_slugs: Set[str] = set()

        for article in articles:
            if len(unique_articles) >= max_count:
                break

            slug = article.get('slug')
            if slug and slug not in seen_slugs:
                seen_slugs.add(slug)
                unique_articles.append(article)

        return unique_articles


# Global instance for convenience (can be imported directly)
_revalidator: Optional[CacheRevalidator] = None


def get_revalidator() -> CacheRevalidator:
    """Get or create a global CacheRevalidator instance."""
    global _revalidator
    if _revalidator is None:
        _revalidator = CacheRevalidator()
    return _revalidator


# Convenience functions for backward compatibility
def trigger_revalidation(article: Dict[str, Any]) -> bool:
    """
    Trigger cache revalidation for a single article.
    Convenience function using global revalidator.

    Args:
        article: Article dictionary

    Returns:
        True if successful, False otherwise
    """
    return get_revalidator().revalidate_article(article)


def trigger_bulk_revalidation(articles: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Trigger bulk cache revalidation for multiple articles.
    Convenience function using global revalidator.

    Args:
        articles: List of article dictionaries

    Returns:
        Dictionary with success status and revalidated paths
    """
    return get_revalidator().revalidate_bulk(articles)
