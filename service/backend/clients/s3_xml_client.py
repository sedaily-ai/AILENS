"""
S3 XML Client
Fetches and parses Seoul Economic Daily article XML from S3

XML Structure mirrors the Korean site exactly.
All data is preserved for the English site with translations added.
"""
import boto3
import xml.etree.ElementTree as ET
import html
import re
import logging
from datetime import datetime, timedelta, timezone
from typing import List, Optional, Dict, Any
from dataclasses import dataclass, field

logger = logging.getLogger(__name__)

# =============================================================================
# Category Normalization
# =============================================================================
# S3 XML uses detailed category hierarchy (e.g., "문화·라이프,건강·의료,제약·바이오")
# We normalize to standard categories for consistent frontend display.
#
# PHASE 72: Added 2026-01-15 to fix missing Technology/Culture articles
# The S3 XML source changed category names:
# - "IT_과학" → "산업,IT일반" or "산업,인터넷"
# - "문화" → "문화·라이프"
# =============================================================================

CATEGORY_NORMALIZATION_MAP = {
    # Technology (IT_과학) - normalize IT-related categories
    # Legacy format (산업 prefix)
    '산업,IT일반': 'IT_과학',
    '산업,인터넷': 'IT_과학',
    '산업,반도체': 'IT_과학',
    '산업,통신': 'IT_과학',
    '산업,가전': 'IT_과학',
    '산업,과학': 'IT_과학',
    # New format since ~2026-01-23 (IT·과학 prefix)
    'IT·과학': 'IT_과학',
    'IT·과학,IT일반': 'IT_과학',
    'IT·과학,인터넷': 'IT_과학',
    'IT·과학,반도체': 'IT_과학',
    'IT·과학,통신': 'IT_과학',
    'IT·과학,가전': 'IT_과학',
    'IT·과학,과학': 'IT_과학',
    'IT·과학,보안·해킹': 'IT_과학',
    'IT·과학,IT기기': 'IT_과학',

    # Culture (문화) - normalize to 문화
    '문화·라이프': '문화',
    '문화·라이프,문화': '문화',
    '문화·라이프,라이프': '문화',
    '문화·라이프,건강·의료': '문화',
    '문화·라이프,자동차': '문화',
    '문화·라이프,여행': '문화',
    '문화·라이프,공연·전시': '문화',
    '문화·라이프,푸드': '문화',

    # Economy (경제)
    '경제,경제동향': '경제',
    '경제,경제일반': '경제',
    '경제,물가': '경제',
    '경제,수출입': '경제',
    '경제,고용': '경제',

    # Finance (금융) - map to 경제
    '금융': '경제',
    '금융,금융정책': '경제',
    '금융,은행': '경제',
    '금융,보험': '경제',
    '금융,카드': '경제',

    # Stock Market (증권) - map to 경제
    '증권': '경제',
    '증권,국내증시': '경제',
    '증권,해외증시': '경제',
    '증권,금융상품·재테크': '경제',
    '증권,종목·투자전략': '경제',
    '증권,증권가일반': '경제',

    # Real Estate (부동산) - map to 경제
    '부동산': '경제',
    '부동산,부동산일반': '경제',
    '부동산,정책·제도': '경제',
    '부동산,건설업계': '경제',
    '부동산,주택': '경제',
    '부동산,분양': '경제',

    # Industry (산업) - default to 경제 unless IT-related
    '산업,기업': '경제',
    '산업,생활': '경제',
    '산업,중기·벤처': '경제',
    '산업,유통': '경제',

    # Politics (정치)
    '정치,국회·정당·정책': '정치',
    '정치,정치일반': '정치',
    '정치,외교·안보': '정치',
    '정치,국방': '정치',
    '정치,행정': '정치',

    # Society (사회)
    '사회,사회일반': '사회',
    '사회,사건사고': '사회',
    '사회,법조': '사회',
    '사회,전국': '사회',
    '사회,환경': '사회',
    '사회,교육': '사회',
    '지역': '사회',

    # Sports (스포츠)
    '스포츠,스포츠 일반': '스포츠',
    '스포츠,골프': '스포츠',
    '스포츠,축구': '스포츠',
    '스포츠,야구': '스포츠',
    '스포츠,배구': '스포츠',
    '스포츠,농구': '스포츠',

    # International (국제)
    '국제,경제·금융': '국제',
    '국제,정치·사회': '국제',
    '국제,산업·기업': '국제',
    '국제,국제일반': '국제',

    # Signal,Deal — capital markets coverage (corporate finance) → 경제
    'Signal': '경제',
    'Signal,Deal': '경제',
    'Signal,Deal,DCM': '경제',
    'Signal,Deal,ECM': '경제',
    'Signal,Deal,M&A': '경제',

    # 오피니언 — editorials and columns → 사회 (most discuss social/political topics)
    '오피니언': '사회',
    '오피니언,사설,사설': '사회',
    '오피니언,사내칼럼,사내칼럼': '사회',
    '오피니언,사외칼럼,사외칼럼': '사회',
}


def normalize_category(raw_category: str) -> str:
    """
    Normalize category from S3 XML to standard category.

    Args:
        raw_category: Raw category string from XML (e.g., "문화·라이프,건강·의료,제약·바이오")

    Returns:
        Normalized category (e.g., "문화")
    """
    if not raw_category:
        return 'news'

    # Check exact match first
    if raw_category in CATEGORY_NORMALIZATION_MAP:
        return CATEGORY_NORMALIZATION_MAP[raw_category]

    # Check prefix matches (e.g., "산업,IT일반,IT일반" should match "산업,IT일반")
    for prefix, normalized in CATEGORY_NORMALIZATION_MAP.items():
        if raw_category.startswith(prefix):
            return normalized

    # Check if the first part of the category matches a standard category
    first_part = raw_category.split(',')[0] if ',' in raw_category else raw_category

    # Direct mapping for top-level categories
    top_level_map = {
        '경제': '경제',
        '정치': '정치',
        '사회': '사회',
        '문화': '문화',
        '스포츠': '스포츠',
        '국제': '국제',
        'IT_과학': 'IT_과학',
        'IT·과학': 'IT_과학',  # New XML format with middle dot
        '산업': '경제',  # Default industry to economy
        '금융': '경제',
        '증권': '경제',
        '부동산': '경제',
        '지역': '사회',
        'Signal': '경제',  # Capital markets coverage
        '오피니언': '사회',  # Editorials and columns
    }

    if first_part in top_level_map:
        return top_level_map[first_part]

    # Default to original if no match found
    logger.warning(f"Unknown category: {raw_category}, using as-is")
    return raw_category


@dataclass
class ImageData:
    """Image data from XML"""
    url: str  # href attribute
    width: str
    height: str
    caption_title: str
    caption_content: str


@dataclass
class RelatedNews:
    """Related news article"""
    title: str
    url: str  # href attribute
    nsid: str  # Extracted from URL


@dataclass
class PushInfo:
    """Push notification info for breaking news"""
    push_id: str
    grade: str
    title: str
    date: str
    time: str


@dataclass
class PaperInfo:
    """Print paper information"""
    publish_date: str
    number: str
    print_number: str
    paper_number: str
    paragraph: str
    position: str
    detail_position: str


@dataclass
class LeverageInfo:
    """Stock/financial leverage info"""
    service_id: str  # Stock code (e.g., "005930" for Samsung)
    service_type: str


@dataclass
class CategoryInfo:
    """Category information"""
    code: str  # e.g., "3712"
    name: str  # e.g., "정치,외교·안보,외교·안보"
    # Parsed category hierarchy
    main_category: str  # e.g., "정치"
    sub_category: str  # e.g., "외교·안보"
    detail_category: str  # e.g., "외교·안보"


@dataclass
class ContentImage:
    """Image embedded in content (legacy - kept for compatibility)"""
    url: str
    alt: str
    width: str
    position: int  # Index order


@dataclass
class ContentBlock:
    """
    Content block for preserving original article structure.

    The article body is split into blocks to maintain image positions exactly.
    Frontend can render blocks in order to match Korean site layout.

    Types:
    - "text": Text paragraph(s)
    - "image": Embedded image with caption

    Styles (for text blocks):
    - "normal": Regular paragraph text
    - "bold": Bold/emphasized text
    - "heading": Subheading (marked with ◆■▶ etc.)
    """
    block_type: str  # "text" or "image"
    # For text blocks
    text_ko: str = ""  # Korean text
    text_en: str = ""  # English translation (filled later)
    style: str = "normal"  # "normal", "bold", or "heading"
    # For image blocks
    image_url: str = ""
    image_alt: str = ""  # Korean alt text
    image_alt_en: str = ""  # English alt text (filled later)
    image_width: str = ""
    image_caption: str = ""  # Korean caption
    image_caption_en: str = ""  # English caption (filled later)


@dataclass
class S3Article:
    """
    Complete article data from S3 XML
    Mirrors Korean site structure exactly
    """
    # Basic info
    nsid: str  # Article ID (e.g., 2K78XY958Z)
    action: str  # I=Insert, U=Update, D=Delete
    item_type: str  # e.g., "text"
    press: str  # e.g., "서울경제"

    # Content
    title: str
    sub_title: Optional[str]
    content_raw: str  # Original content with HTML tags
    content_clean: str  # Cleaned text content (for full-text search, translation)
    content_blocks: List[ContentBlock]  # Structured blocks preserving image positions
    content_images: List[ContentImage]  # Images extracted from content (legacy)

    # Author & Time
    author: str  # e.g., "이현호 기자(hhlee@sedaily.com)"
    author_name: str  # Extracted: "이현호 기자"
    author_email: str  # Extracted: "hhlee@sedaily.com"
    date: str  # e.g., "2026-01-10"
    time: str  # e.g., "10:23:53"
    published_at: str  # ISO format: "2026-01-10T10:23:53+09:00"

    # Category
    categories: List[CategoryInfo]
    main_category: str  # Primary category name

    # URL
    url: str  # Article URL on sedaily.com

    # Media
    images: List[ImageData]  # Standalone images

    # Related
    related_news: List[RelatedNews]

    # Financial
    leverage: List[LeverageInfo]  # Related stock codes

    # Push notification (for breaking news)
    push: Optional[PushInfo]
    is_breaking_news: bool

    # Paper info
    paper: Optional[PaperInfo]


class S3XMLClient:
    """
    Client for fetching and parsing Seoul Economic Daily XML from S3

    XML is stored at: s3://sedaily-news-xml-storage/daily-xml/YYYYMMDD.xml
    Updated throughout the day with new articles
    """

    def __init__(
        self,
        bucket_name: str = "sedaily-news-xml-storage",
        prefix: str = "daily-xml",
        region: str = "ap-northeast-2"
    ):
        self.bucket_name = bucket_name
        self.prefix = prefix
        self.s3 = boto3.client('s3', region_name=region)

    def _extract_nsid_from_url(self, url: str) -> str:
        """Extract nsid from sedaily URL"""
        if not url:
            return ""
        # https://www.sedaily.com/NewsView/2K77LQ2VQO?...
        match = re.search(r'/NewsView/([A-Z0-9]+)', url)
        return match.group(1) if match else ""

    def _parse_author(self, author_str: str) -> tuple:
        """
        Parse author string into name and email

        Args:
            author_str: e.g., "이현호 기자(hhlee@sedaily.com)"

        Returns:
            (name, email) tuple
        """
        if not author_str:
            return ("", "")

        # Pattern: 이름 직함(email@sedaily.com)
        match = re.match(r'(.+?)\(([^)]+)\)', author_str)
        if match:
            return (match.group(1).strip(), match.group(2).strip())

        return (author_str.strip(), "")

    def _parse_category(self, category_elem: ET.Element) -> Optional[CategoryInfo]:
        """Parse category element"""
        if category_elem is None:
            return None

        code = category_elem.get('code', '')
        name = category_elem.get('name', '')

        # Parse hierarchy: "정치,외교·안보,외교·안보"
        parts = name.split(',') if name else []

        return CategoryInfo(
            code=code,
            name=name,
            main_category=parts[0] if len(parts) > 0 else '',
            sub_category=parts[1] if len(parts) > 1 else '',
            detail_category=parts[2] if len(parts) > 2 else ''
        )

    def _parse_image(self, image_elem: ET.Element) -> Optional[ImageData]:
        """Parse image element"""
        if image_elem is None:
            return None

        return ImageData(
            url=image_elem.get('href', ''),
            width=image_elem.get('width', ''),
            height=image_elem.get('height', ''),
            caption_title=image_elem.get('caption_title', ''),
            caption_content=image_elem.get('caption_content', '')
        )

    def _parse_related_news(self, rel_elem: ET.Element) -> Optional[RelatedNews]:
        """Parse related news element"""
        if rel_elem is None:
            return None

        url = rel_elem.get('href', '')
        title = html.unescape(rel_elem.get('title', ''))

        return RelatedNews(
            title=title,
            url=url,
            nsid=self._extract_nsid_from_url(url)
        )

    def _parse_leverage(self, lev_elem: ET.Element) -> Optional[LeverageInfo]:
        """Parse leverage (stock code) element"""
        if lev_elem is None:
            return None

        return LeverageInfo(
            service_id=lev_elem.get('service_id', ''),
            service_type=lev_elem.get('service_type', '')
        )

    def _parse_push(self, push_elem: ET.Element) -> Optional[PushInfo]:
        """Parse push notification element"""
        if push_elem is None:
            return None

        return PushInfo(
            push_id=push_elem.findtext('pushId', ''),
            grade=push_elem.findtext('grade', ''),
            title=html.unescape(push_elem.findtext('title', '')),
            date=push_elem.findtext('date', ''),
            time=push_elem.findtext('time', '')
        )

    def _parse_paper(self, paper_elem: ET.Element) -> Optional[PaperInfo]:
        """Parse paper (print edition) element"""
        if paper_elem is None:
            return None

        pub_info = paper_elem.find('publishInfo')
        edit_info = paper_elem.find('editingInfo')

        return PaperInfo(
            publish_date=pub_info.findtext('date', '') if pub_info is not None else '',
            number=pub_info.findtext('number', '') if pub_info is not None else '',
            print_number=pub_info.findtext('printNumber', '') if pub_info is not None else '',
            paper_number=edit_info.findtext('paperNumber', '') if edit_info is not None else '',
            paragraph=edit_info.findtext('paragraph', '') if edit_info is not None else '',
            position=edit_info.findtext('position', '') if edit_info is not None else '',
            detail_position=edit_info.findtext('detailPosition', '') if edit_info is not None else ''
        )

    def _detect_text_style(self, text: str, original_html: str) -> str:
        """
        Detect text style based on HTML tags and content patterns.

        Args:
            text: Cleaned text content
            original_html: Original HTML before cleaning

        Returns:
            Style string: "normal", "bold", or "heading"
        """
        # Check if entire text was wrapped in bold tags
        bold_pattern = r'<b[^>]*>.*?</b>|<strong[^>]*>.*?</strong>'
        original_lower = original_html.lower()

        # If the text is short and wrapped in bold/strong, it's likely a heading
        if len(text) < 100:
            # Check for heading markers (common in Korean news)
            heading_markers = ['◆', '■', '▶', '●', '◇', '△', '▷', '○', '☞', '※']
            if any(text.startswith(marker) for marker in heading_markers):
                return "heading"

            # Check if wrapped in bold
            if '<b>' in original_lower or '<strong>' in original_lower:
                # Short bold text is likely a subheading
                return "heading"

        # Check for bold formatting (longer text)
        if '<b>' in original_lower and '</b>' in original_lower:
            return "bold"
        if '<strong>' in original_lower and '</strong>' in original_lower:
            return "bold"

        return "normal"

    def _clean_content(self, raw_content: str) -> tuple:
        """
        Clean HTML content and extract structured content blocks.

        Preserves the exact position of images within the article body
        so frontend can render identical layout to Korean site.

        Args:
            raw_content: Raw content with HTML entities and tags

        Returns:
            (clean_text, list of ContentImage, list of ContentBlock)
        """
        if not raw_content:
            return ("", [], [])

        # Decode HTML entities
        content = html.unescape(raw_content)

        # Split content by IMG tags to preserve structure
        img_pattern = r'(<IMG[^>]*>)'
        parts = re.split(img_pattern, content, flags=re.IGNORECASE)

        content_blocks = []
        content_images = []  # Legacy: for backwards compatibility
        all_text_parts = []  # For building clean text

        img_index = 0
        for part in parts:
            if re.match(r'<IMG', part, re.IGNORECASE):
                # Parse image tag
                src_match = re.search(r'src="([^"]*)"', part, re.IGNORECASE)
                alt_match = re.search(r'alt="([^"]*)"', part, re.IGNORECASE)
                width_match = re.search(r'width="([^"]*)"', part, re.IGNORECASE)

                img_url = src_match.group(1) if src_match else ''
                img_alt = alt_match.group(1) if alt_match else ''
                img_width = width_match.group(1) if width_match else ''

                # Add image block
                content_blocks.append(ContentBlock(
                    block_type="image",
                    image_url=img_url,
                    image_alt=img_alt,
                    image_width=img_width,
                    image_caption=img_alt  # Use alt as caption
                ))

                # Legacy: add to content_images
                content_images.append(ContentImage(
                    url=img_url,
                    alt=img_alt,
                    width=img_width,
                    position=img_index
                ))
                img_index += 1
            else:
                # Keep original HTML for style detection
                original_html = part

                # Clean text part
                text = part

                # Replace BR tags with newlines
                text = re.sub(r'<BR\s*/?>', '\n', text, flags=re.IGNORECASE)

                # Remove paragraph tags but keep content
                text = re.sub(r'<p>', '', text, flags=re.IGNORECASE)
                text = re.sub(r'</p>', '\n\n', text, flags=re.IGNORECASE)

                # Remove bold/strong tags but note their presence
                text = re.sub(r'<b[^>]*>|</b>', '', text, flags=re.IGNORECASE)
                text = re.sub(r'<strong[^>]*>|</strong>', '', text, flags=re.IGNORECASE)

                # Remove any remaining HTML tags
                text = re.sub(r'<[^>]+>', '', text)

                # Clean up whitespace
                text = re.sub(r'\n{3,}', '\n\n', text)
                text = re.sub(r'[ \t]+', ' ', text)
                text = text.strip()

                # Remove [서울경제] prefix
                text = re.sub(r'^\[서울경제\]\s*', '', text)

                if text:
                    # Detect style based on original HTML and cleaned text
                    style = self._detect_text_style(text, original_html)

                    content_blocks.append(ContentBlock(
                        block_type="text",
                        text_ko=text,
                        style=style
                    ))
                    all_text_parts.append(text)

        # Build clean text (all text without images, for search/translation)
        clean_text = '\n\n'.join(all_text_parts)

        return (clean_text, content_images, content_blocks)

    def _parse_article(self, item: ET.Element) -> Optional[S3Article]:
        """
        Parse a single article item from XML

        Args:
            item: XML Element for one article

        Returns:
            S3Article object or None if parsing fails
        """
        try:
            nsid = item.findtext('nsid', '')
            if not nsid:
                return None

            # Basic info
            action = item.findtext('action', 'I')
            item_type = item.get('type', 'text')
            press = item.findtext('press', '서울경제')

            # Content (decode HTML entities in title/subtitle)
            title = html.unescape(item.findtext('title', ''))
            sub_title_raw = item.findtext('subTitle')
            sub_title = html.unescape(sub_title_raw) if sub_title_raw else None
            raw_content = item.findtext('content', '')
            clean_content, content_images, content_blocks = self._clean_content(raw_content)

            # Author
            author_str = item.findtext('author', '')
            author_name, author_email = self._parse_author(author_str)

            # Date/Time
            date = item.findtext('date', '')
            time_str = item.findtext('time', '')

            # Create ISO format published_at
            published_at = ""
            if date and time_str:
                try:
                    dt = datetime.strptime(f"{date} {time_str}", "%Y-%m-%d %H:%M:%S")
                    kst = timezone(timedelta(hours=9))
                    dt = dt.replace(tzinfo=kst)
                    published_at = dt.isoformat()
                except ValueError:
                    published_at = f"{date}T{time_str}+09:00"

            # Categories (can have multiple)
            categories = []
            for cat_elem in item.findall('category'):
                cat = self._parse_category(cat_elem)
                if cat:
                    categories.append(cat)

            # Get raw main category and normalize it
            raw_main_category = categories[0].main_category if categories else ''
            # Also consider the full category name for more precise normalization
            full_category_name = categories[0].name if categories else ''
            main_category = normalize_category(full_category_name) if full_category_name else normalize_category(raw_main_category)

            # URL
            url_elem = item.find('url')
            url = url_elem.get('href', '') if url_elem is not None else f"https://www.sedaily.com/NewsView/{nsid}"

            # Images
            images = []
            for img_elem in item.findall('image'):
                img = self._parse_image(img_elem)
                if img:
                    images.append(img)

            # Related news
            related_news = []
            for rel_elem in item.findall('relNews'):
                rel = self._parse_related_news(rel_elem)
                if rel:
                    related_news.append(rel)

            # Leverage (stock codes)
            leverage = []
            for lev_elem in item.findall('leverage'):
                lev = self._parse_leverage(lev_elem)
                if lev:
                    leverage.append(lev)

            # Push notification
            push_elem = item.find('push')
            push = self._parse_push(push_elem)

            # Paper info
            paper_elem = item.find('paper')
            paper = self._parse_paper(paper_elem)

            return S3Article(
                nsid=nsid,
                action=action,
                item_type=item_type,
                press=press,
                title=title,
                sub_title=sub_title,
                content_raw=raw_content,
                content_clean=clean_content,
                content_blocks=content_blocks,
                content_images=content_images,
                author=author_str,
                author_name=author_name,
                author_email=author_email,
                date=date,
                time=time_str,
                published_at=published_at,
                categories=categories,
                main_category=main_category,
                url=url,
                images=images,
                related_news=related_news,
                leverage=leverage,
                push=push,
                is_breaking_news=push is not None,
                paper=paper
            )

        except Exception as e:
            logger.error(f"Failed to parse article: {e}", exc_info=True)
            return None

    async def get_articles_by_date(self, date_str: str) -> List[S3Article]:
        """
        Get all articles for a specific date

        Args:
            date_str: Date in YYYYMMDD format (e.g., "20260110")

        Returns:
            List of S3Article objects
        """
        key = f"{self.prefix}/{date_str}.xml"
        logger.info(f"Fetching articles from s3://{self.bucket_name}/{key}")

        try:
            response = self.s3.get_object(Bucket=self.bucket_name, Key=key)
            xml_content = response['Body'].read().decode('utf-8')

            # Parse XML
            root = ET.fromstring(xml_content)

            # Get metadata from root
            xml_date = root.get('date', '')
            xml_count = root.get('count', '')
            logger.info(f"XML metadata: date={xml_date}, count={xml_count}")

            articles = []
            for item in root.findall('item'):
                article = self._parse_article(item)
                if article:
                    articles.append(article)

            logger.info(f"Parsed {len(articles)} articles from {date_str}.xml")

            # Log action breakdown
            action_counts = {'I': 0, 'U': 0, 'D': 0}
            for a in articles:
                action_counts[a.action] = action_counts.get(a.action, 0) + 1
            logger.info(f"Action breakdown: Insert={action_counts['I']}, Update={action_counts['U']}, Delete={action_counts['D']}")

            return articles

        except self.s3.exceptions.NoSuchKey:
            logger.warning(f"XML file not found: {key}")
            return []
        except Exception as e:
            logger.error(f"Failed to fetch/parse XML from {key}: {e}", exc_info=True)
            return []

    async def get_today_articles(self) -> List[S3Article]:
        """Get all articles for today (KST)"""
        kst = timezone(timedelta(hours=9))
        today = datetime.now(kst).strftime("%Y%m%d")
        return await self.get_articles_by_date(today)

    async def get_articles_to_process(self, date_str: str = None) -> Dict[str, List[S3Article]]:
        """
        Get articles grouped by action type

        Returns:
            Dict with 'new', 'updated', 'deleted' keys
        """
        if date_str is None:
            articles = await self.get_today_articles()
        else:
            articles = await self.get_articles_by_date(date_str)

        return {
            'new': [a for a in articles if a.action == 'I'],
            'updated': [a for a in articles if a.action == 'U'],
            'deleted': [a for a in articles if a.action == 'D']
        }

    def article_to_dict(self, article: S3Article) -> Dict[str, Any]:
        """
        Convert S3Article to dictionary for DynamoDB storage

        Preserves all data from Korean site structure
        """
        return {
            # IDs
            'nsid': article.nsid,
            'news_id': article.nsid,  # Alias for compatibility
            'action': article.action,
            'item_type': article.item_type,
            'press': article.press,

            # Content (Korean)
            'title_ko': article.title,
            'sub_title_ko': article.sub_title or '',
            'content_ko': article.content_clean,
            'content_raw': article.content_raw,
            'content_blocks': [
                # Text block: include text fields and style
                {
                    'type': 'text',
                    'text_ko': block.text_ko,
                    'text_en': block.text_en,
                    'style': block.style  # "normal", "bold", or "heading"
                } if block.block_type == "text" else
                # Image block: include image fields with translations
                {
                    'type': 'image',
                    'url': block.image_url,
                    'alt': block.image_alt,  # Korean
                    'alt_en': block.image_alt_en,  # English
                    'width': block.image_width,
                    'caption': block.image_caption,  # Korean
                    'caption_en': block.image_caption_en  # English
                }
                for block in article.content_blocks
            ],

            # Author
            'author': article.author,
            'author_name': article.author_name,
            'author_email': article.author_email,
            'byline': article.author_name,  # Alias for compatibility

            # Date/Time
            'date': article.date,
            'time': article.time,
            'published_at': article.published_at,

            # Category
            'categories': [
                {'code': c.code, 'name': c.name,
                 'main': c.main_category, 'sub': c.sub_category, 'detail': c.detail_category}
                for c in article.categories
            ],
            'category': article.main_category,

            # URL
            'url': article.url,
            'original_link': article.url,

            # Images (standalone images from XML <image> tag)
            'images': [
                {'url': img.url, 'width': img.width, 'height': img.height,
                 'caption_title': img.caption_title, 'caption_content': img.caption_content}
                for img in article.images
            ],
            # Note: content_images removed - use content_blocks instead

            # Related news
            'related_news': [
                {'title': rel.title, 'url': rel.url, 'nsid': rel.nsid}
                for rel in article.related_news
            ],

            # Leverage (stock codes)
            'leverage': [
                {'service_id': lev.service_id, 'service_type': lev.service_type}
                for lev in article.leverage
            ],

            # Push notification
            'is_breaking_news': article.is_breaking_news,
            'push': {
                'push_id': article.push.push_id,
                'grade': article.push.grade,
                'title': article.push.title,
                'date': article.push.date,
                'time': article.push.time
            } if article.push else None,

            # Paper info
            'paper': {
                'publish_date': article.paper.publish_date,
                'number': article.paper.number,
                'print_number': article.paper.print_number,
                'paper_number': article.paper.paper_number,
                'paragraph': article.paper.paragraph,
                'position': article.paper.position,
                'detail_position': article.paper.detail_position
            } if article.paper else None
        }
