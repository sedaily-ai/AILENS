"""Article 비즈니스 로직 — handlers/article_handler.py에서 추출
(2026-08-24, 코드 리팩토링 감사 Track B, God 파일 분해).

When user views an article:
1. Fetch from PostgreSQL (v1.25 — lens-cms-api 경유, 본문 이미 인라인 저장)
2. Return the article's original content

2026-09-09(v1.25): DynamoDB(+S3 body pointer)에서 PostgreSQL로 전환.
articles.body가 이미 100% 백필돼 있어 S3 merge 단계 자체가 없어졌다.
"""
import logging
from typing import Optional
from dataclasses import dataclass

import clients.pg.articles as articles_client
from common.dates.date_utils import get_kst_today

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
    Handles article detail retrieval from PostgreSQL (lens-cms-api 경유)
    """

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

            # Retrieve from PostgreSQL
            cached_article = articles_client.get_article(article_id)
            if not cached_article:
                logger.warning(f"Article {article_id} not found in PostgreSQL")
                raise ArticleHandlerError(
                    "Article not found. This article has not been processed yet."
                )

            logger.info(f"Retrieved article {article_id} from PostgreSQL")

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


async def list_articles(date_str: str, limit: int) -> dict:
    """
    GET /api/articles?date=YYYYMMDD&limit=30 의 실제 조회 로직.

    List articles for a given date (PostgreSQL, lens-cms-api 경유).
    """
    date_str = (date_str or "").strip() or get_kst_today()

    try:
        limit = int(limit)
    except (ValueError, TypeError):
        limit = 30
    limit = max(1, min(limit, 200))

    articles = articles_client.get_transformed_articles_by_date(date_str, limit)
    result_articles = [_transform_article_for_list(a) for a in articles] if articles else []

    return {
        "date": date_str,
        "total": len(result_articles),
        "articles": result_articles,
    }


async def get_article_detail(article_id: str) -> ArticleDetailResponse:
    """GET /api/article/{article_id} 의 실제 조회 로직 (legacy detail route)."""
    handler = ArticleHandler()
    return await handler.handle_article_detail(article_id)
