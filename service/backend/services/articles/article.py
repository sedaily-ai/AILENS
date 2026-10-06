"""Article 비즈니스 로직 — 기사 목록·상세 조회.

`handlers/articles/article.py`가 호출한다. 기사는 PostgreSQL(lens-cms-api 경유)에서 조회하며,
본문(articles.body)이 인라인으로 저장돼 있어 별도 S3 조회는 없다.
"""
import logging
from typing import Optional
from dataclasses import dataclass

import clients.pg.articles as articles_client
from common.dates.date_utils import get_kst_today

logger = logging.getLogger(__name__)


@dataclass
class ArticleDetailResponse:
    """기사 상세 응답 모델."""
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
        # image_url 이 없으면 첫 이미지에서 추출
        if self.image_url is None and self.images:
            if isinstance(self.images, list) and len(self.images) > 0:
                first_img = self.images[0]
                if isinstance(first_img, dict):
                    self.image_url = first_img.get('url', '')
                elif isinstance(first_img, str):
                    self.image_url = first_img


class ArticleHandlerError(Exception):
    """ArticleHandler 오류의 기반 예외."""
    pass


class ArticleHandler:
    """PostgreSQL(lens-cms-api 경유)에서 기사 상세를 조회한다."""

    async def handle_article_detail(
        self,
        article_id: str
    ) -> ArticleDetailResponse:
        """기사 원문 상세를 조회한다.

        Args:
            article_id: 기사 ID(news_id).

        Raises:
            ArticleHandlerError: 조회 실패 시.
        """
        try:
            if not article_id or not article_id.strip():
                raise ArticleHandlerError("Article ID is required")

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
            raise
        except Exception as e:
            logger.error(f"Unexpected error in article handler: {e}", exc_info=True)
            raise ArticleHandlerError(
                "An unexpected error occurred. Please try again later."
            )


def _extract_image_url(images) -> Optional[str]:
    """기사 images 필드에서 첫 이미지 URL을 추출한다.

    images 는 ``{'url': ..., 'caption': ...}`` dict 리스트 또는 문자열 리스트이며,
    사용할 값이 없으면 None을 반환한다.
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
    """기사를 /api/articles 목록 항목 형식으로 변환한다."""
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
    """GET /api/articles?date=YYYYMMDD&limit=30 의 조회 로직. 날짜별 기사 목록을 반환한다."""
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
    """GET /api/article/{article_id} 의 조회 로직(레거시 상세 라우트)."""
    handler = ArticleHandler()
    return await handler.handle_article_detail(article_id)
