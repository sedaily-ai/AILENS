"""
Article model and related data structures.
"""

from dataclasses import dataclass, field
from typing import Optional, List, Dict, Any
from datetime import datetime


@dataclass
class ContentBlock:
    """Represents a content block within an article (text or image)."""
    type: str  # 'text' or 'image'
    content: str = ''
    image_url: Optional[str] = None
    caption: Optional[str] = None
    style: Optional[str] = None  # 'heading', 'bold', 'normal'

    def to_dict(self) -> Dict[str, Any]:
        result = {'type': self.type}
        if self.content:
            result['content'] = self.content
        if self.image_url:
            result['image_url'] = self.image_url
        if self.caption:
            result['caption'] = self.caption
        if self.style:
            result['style'] = self.style
        return result


@dataclass
class RelatedNews:
    """Represents a related news item."""
    title: str
    url: str
    nsid: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        result = {'title': self.title, 'url': self.url}
        if self.nsid:
            result['nsid'] = self.nsid
        return result


@dataclass
class PushInfo:
    """Represents push notification information."""
    push_time: Optional[str] = None
    type: Optional[str] = None
    title: Optional[str] = None
    body: Optional[str] = None
    target: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {k: v for k, v in {
            'push_time': self.push_time,
            'type': self.type,
            'title': self.title,
            'body': self.body,
            'target': self.target,
        }.items() if v is not None}


@dataclass
class PaperInfo:
    """Represents print edition information."""
    edition: Optional[str] = None
    section: Optional[str] = None
    page: Optional[str] = None
    sequence: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {k: v for k, v in {
            'edition': self.edition,
            'section': self.section,
            'page': self.page,
            'sequence': self.sequence,
        }.items() if v is not None}


@dataclass
class Article:
    """
    Article model representing a translated news article.
    Mirrors the structure stored in DynamoDB.
    """
    # Core IDs
    news_id: str
    slug: str = ''
    item_type: str = 'article'
    action: str = 'I'  # I=Insert, U=Update, D=Delete
    press: str = '서울경제'

    # Content (Korean original)
    title_ko: str = ''
    sub_title_ko: str = ''
    content_ko: str = ''
    content_raw: str = ''

    # MBTI Transformed versions (4 groups)
    # Each version stores: title, subtitle, body (list), key_points (list), closing_line, tone
    version_NT: Dict[str, Any] = field(default_factory=dict)
    version_NF: Dict[str, Any] = field(default_factory=dict)
    version_ST: Dict[str, Any] = field(default_factory=dict)
    version_SF: Dict[str, Any] = field(default_factory=dict)

    # Author
    author: str = ''
    author_name: str = ''
    author_email: str = ''
    byline: str = ''  # Korean byline

    # Date/Time
    date: str = ''
    time: str = ''
    published_at: str = ''

    # Category
    category: str = ''
    categories: List[Dict[str, str]] = field(default_factory=list)

    # URLs
    url: str = ''
    original_link: str = ''

    # Images
    images: List[str] = field(default_factory=list)
    images_caption: List[str] = field(default_factory=list)

    # Content blocks (preserves image positions within article body)
    content_blocks: List[Dict[str, Any]] = field(default_factory=list)

    # Related news
    related_news: List[Dict[str, Any]] = field(default_factory=list)

    # Leverage (stock codes)
    leverage: List[Dict[str, Any]] = field(default_factory=list)

    # Push notification info
    is_breaking_news: bool = False
    push: Optional[Dict[str, Any]] = None

    # Paper info (print edition)
    paper: Optional[Dict[str, Any]] = None

    # SEO metadata
    meta_description: str = ''
    keywords: str = ''
    hashtags: str = ''

    # AI generated
    ai_summary: str = ''
    ai_key_points: List[str] = field(default_factory=list)

    # Video
    naver_tv_url: str = ''

    # Metadata
    transformed_at: str = ''
    content_hash: str = ''
    updated_at: Optional[str] = None
    created_at: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert article to dictionary for DynamoDB storage."""
        result = {
            'news_id': self.news_id,
            'item_type': self.item_type,
            'slug': self.slug,
            'action': self.action,
            'press': self.press,
            'title_ko': self.title_ko,
            'sub_title_ko': self.sub_title_ko,
            'content_ko': self.content_ko,
            'content_raw': self.content_raw,
            'version_NT': self.version_NT,
            'version_NF': self.version_NF,
            'version_ST': self.version_ST,
            'version_SF': self.version_SF,
            'author': self.author,
            'author_name': self.author_name,
            'author_email': self.author_email,
            'byline': self.byline,
            'date': self.date,
            'time': self.time,
            'published_at': self.published_at,
            'category': self.category,
            'categories': self.categories,
            'url': self.url,
            'original_link': self.original_link,
            'images': self.images,
            'images_caption': self.images_caption,
            'content_blocks': self.content_blocks,
            'related_news': self.related_news,
            'leverage': self.leverage,
            'is_breaking_news': self.is_breaking_news,
            'meta_description': self.meta_description,
            'keywords': self.keywords,
            'hashtags': self.hashtags,
            'ai_summary': self.ai_summary,
            'ai_key_points': self.ai_key_points,
            'naver_tv_url': self.naver_tv_url,
            'transformed_at': self.transformed_at,
            'content_hash': self.content_hash,
        }

        # Add optional fields if present
        if self.push:
            result['push'] = self.push
        if self.paper:
            result['paper'] = self.paper
        if self.updated_at:
            result['updated_at'] = self.updated_at
        if self.created_at:
            result['created_at'] = self.created_at

        # Remove empty strings and None values
        return {k: v for k, v in result.items() if v is not None and v != ''}

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'Article':
        """Create Article instance from dictionary."""
        return cls(
            news_id=data.get('news_id', ''),
            slug=data.get('slug', ''),
            item_type=data.get('item_type', 'article'),
            action=data.get('action', 'I'),
            press=data.get('press', '서울경제'),
            title_ko=data.get('title_ko', ''),
            sub_title_ko=data.get('sub_title_ko', ''),
            content_ko=data.get('content_ko', ''),
            content_raw=data.get('content_raw', ''),
            version_NT=data.get('version_NT', {}),
            version_NF=data.get('version_NF', {}),
            version_ST=data.get('version_ST', {}),
            version_SF=data.get('version_SF', {}),
            author=data.get('author', ''),
            author_name=data.get('author_name', ''),
            author_email=data.get('author_email', ''),
            byline=data.get('byline', ''),
            date=data.get('date', ''),
            time=data.get('time', ''),
            published_at=data.get('published_at', ''),
            category=data.get('category', ''),
            categories=data.get('categories', []),
            url=data.get('url', ''),
            original_link=data.get('original_link', ''),
            images=data.get('images', []),
            images_caption=data.get('images_caption', []),
            content_blocks=data.get('content_blocks', []),
            related_news=data.get('related_news', []),
            leverage=data.get('leverage', []),
            is_breaking_news=data.get('is_breaking_news', False),
            push=data.get('push'),
            paper=data.get('paper'),
            meta_description=data.get('meta_description', ''),
            keywords=data.get('keywords', ''),
            hashtags=data.get('hashtags', ''),
            ai_summary=data.get('ai_summary', ''),
            ai_key_points=data.get('ai_key_points', []),
            naver_tv_url=data.get('naver_tv_url', ''),
            transformed_at=data.get('transformed_at', ''),
            content_hash=data.get('content_hash', ''),
            updated_at=data.get('updated_at'),
            created_at=data.get('created_at'),
        )


@dataclass
class ArticleVersion:
    """Represents a historical version of an MBTI-transformed article."""
    version_id: str
    article_id: str
    version_timestamp: str
    change_type: str  # 'auto_update', 'manual_edit', 'retransform'
    title_ko: str = ''
    content_ko: str = ''
    content_hash: str = ''
    version_NT: Dict[str, Any] = field(default_factory=dict)
    version_NF: Dict[str, Any] = field(default_factory=dict)
    version_ST: Dict[str, Any] = field(default_factory=dict)
    version_SF: Dict[str, Any] = field(default_factory=dict)
    category: str = ''

    def to_dict(self) -> Dict[str, Any]:
        return {
            'news_id': self.version_id,
            'item_type': 'article_version',
            'article_id': self.article_id,
            'version_timestamp': self.version_timestamp,
            'change_type': self.change_type,
            'title_ko': self.title_ko,
            'content_ko': self.content_ko,
            'content_hash': self.content_hash,
            'version_NT': self.version_NT,
            'version_NF': self.version_NF,
            'version_ST': self.version_ST,
            'version_SF': self.version_SF,
            'category': self.category,
        }

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'ArticleVersion':
        return cls(
            version_id=data.get('news_id', ''),
            article_id=data.get('article_id', ''),
            version_timestamp=data.get('version_timestamp', ''),
            change_type=data.get('change_type', ''),
            title_ko=data.get('title_ko', ''),
            content_ko=data.get('content_ko', ''),
            content_hash=data.get('content_hash', ''),
            version_NT=data.get('version_NT', {}),
            version_NF=data.get('version_NF', {}),
            version_ST=data.get('version_ST', {}),
            version_SF=data.get('version_SF', {}),
            category=data.get('category', ''),
        )


@dataclass
class CollectionLog:
    """Represents a collection run log entry."""
    log_id: str
    timestamp: str
    item_type: str = 'collection_log'
    status: str = 'completed'  # 'completed', 'failed', 'partial'
    total_articles: int = 0
    new_articles: int = 0
    updated_articles: int = 0
    failed_articles: int = 0
    skipped_articles: int = 0
    duration_seconds: float = 0.0
    errors: List[str] = field(default_factory=list)
    details: Optional[Dict[str, Any]] = None

    def to_dict(self) -> Dict[str, Any]:
        result = {
            'news_id': self.log_id,
            'item_type': self.item_type,
            'timestamp': self.timestamp,
            'status': self.status,
            'total_articles': self.total_articles,
            'new_articles': self.new_articles,
            'updated_articles': self.updated_articles,
            'failed_articles': self.failed_articles,
            'skipped_articles': self.skipped_articles,
            'duration_seconds': self.duration_seconds,
        }
        if self.errors:
            result['errors'] = self.errors
        if self.details:
            result['details'] = self.details
        return result

    @classmethod
    def from_dict(cls, data: Dict[str, Any]) -> 'CollectionLog':
        return cls(
            log_id=data.get('news_id', ''),
            timestamp=data.get('timestamp', ''),
            item_type=data.get('item_type', 'collection_log'),
            status=data.get('status', 'completed'),
            total_articles=data.get('total_articles', 0),
            new_articles=data.get('new_articles', 0),
            updated_articles=data.get('updated_articles', 0),
            failed_articles=data.get('failed_articles', 0),
            skipped_articles=data.get('skipped_articles', 0),
            duration_seconds=data.get('duration_seconds', 0.0),
            errors=data.get('errors', []),
            details=data.get('details'),
        )
