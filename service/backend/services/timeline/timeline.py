"""Timeline("뉴스 타임머신") 비즈니스 로직.

데이터 소스는 S3(`sedaily-news-xml-storage/daily-xml/{YYYYMMDD}.xml`) 단일이며,
`services/articles/s3_articles.py`와 같은 버킷·파서를 사용한다.
허용 mode 는 'flat'(그날 기사를 최신순으로 나열) 하나뿐이다.

캐시: 같은 날짜를 페이지·필터만 바꿔 반복 조회할 때 XML을 다시 내려받지 않도록,
필터(action=D 제외)·정렬을 마친 기사 목록을 프로세스 메모리에 둔다(`_DayCache`).
정책은 아래 상수를 따른다.
"""
import asyncio
import logging
import math
import threading
import time
from collections import OrderedDict
from dataclasses import dataclass, field
from typing import List, Optional, Tuple

from clients.s3.xml_articles import S3XMLClient
from common.dates.validation import today_kst

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

DEFAULT_PAGE_SIZE = 30
ALLOWED_MODES = ('flat',)

# ── 메모리 캐시 정책 ─────────────────────────────────────────────────────────
# 과거 날짜 XML 은 확정본이라 길게, 오늘은 기사가 계속 쌓이므로 짧게.
# 0건 결과는 S3 오류(S3XMLClient 가 오류를 삼키고 [] 를 반환함)와 구분이 안 되므로
# 날짜와 무관하게 짧게만 둔다. 크기는 최근 조회 N일 LRU 로 제한(Lambda 메모리 보호).
PAST_DATE_TTL_SECONDS = 3600
TODAY_TTL_SECONDS = 60
EMPTY_TTL_SECONDS = 60
MAX_CACHED_DATES = 8

_s3_xml_client: Optional[S3XMLClient] = None


def _get_s3_xml_client() -> S3XMLClient:
    """Lambda 컨테이너당 한 번만 생성한다."""
    global _s3_xml_client
    if _s3_xml_client is None:
        _s3_xml_client = S3XMLClient()
    return _s3_xml_client


@dataclass
class TimelineRequest:
    date: str
    query: Optional[str] = None
    categories: List[str] = field(default_factory=list)
    page: int = 1
    page_size: int = DEFAULT_PAGE_SIZE
    mode: str = 'flat'

    @property
    def return_from(self) -> int:
        return (self.page - 1) * self.page_size


# ── 날짜별 메모리 캐시 (LRU + TTL) ──────────────────────────────────────────

class _DayCache:
    """date(YYYY-MM-DD) → (만료 monotonic 시각, 정렬 끝난 기사 목록). 스레드 안전."""

    def __init__(self, max_dates: int):
        self._max = max_dates
        self._data: 'OrderedDict[str, Tuple[float, list]]' = OrderedDict()
        self._lock = threading.Lock()

    def get(self, date: str) -> Optional[list]:
        with self._lock:
            entry = self._data.get(date)
            if entry is None:
                return None
            expires_at, articles = entry
            if time.monotonic() >= expires_at:
                del self._data[date]
                return None
            self._data.move_to_end(date)
            return articles

    def put(self, date: str, articles: list, ttl: float) -> None:
        with self._lock:
            self._data[date] = (time.monotonic() + ttl, articles)
            self._data.move_to_end(date)
            while len(self._data) > self._max:
                self._data.popitem(last=False)

    def clear(self) -> None:
        with self._lock:
            self._data.clear()


_day_cache = _DayCache(MAX_CACHED_DATES)


def _ttl_for(date: str, articles: list) -> float:
    if not articles:
        return EMPTY_TTL_SECONDS
    return PAST_DATE_TTL_SECONDS if date < today_kst() else TODAY_TTL_SECONDS


# ── S3 XML (서울경제 원본 피드) ─────────────────────────────────────────────

def _load_day_articles(date: str) -> list:
    """해당 날짜의 (삭제 제외, 최신순) 기사 목록. 메모리 캐시를 먼저 본다."""
    cached = _day_cache.get(date)
    if cached is not None:
        return cached

    client = _get_s3_xml_client()
    date_str = date.replace('-', '')  # S3XMLClient는 YYYYMMDD 키를 쓴다
    articles = asyncio.run(client.get_articles_by_date(date_str))

    # 삭제(action='D') 항목 제외
    articles = [a for a in articles if a.action != 'D']
    articles.sort(key=lambda a: a.published_at, reverse=True)

    _day_cache.put(date, articles, _ttl_for(date, articles))
    return articles


def _filter_articles(articles: list, categories: List[str], query: Optional[str]) -> list:
    if categories:
        articles = [a for a in articles if a.main_category in categories]

    # query 는 제목·본문 부분 문자열 매칭이다(S3 XML에는 검색 엔진이 없다).
    if query:
        q = query.lower()
        articles = [
            a for a in articles
            if q in a.title.lower() or q in (a.content_clean or '').lower()
        ]
    return articles


def fetch_from_s3_xml(req: TimelineRequest) -> dict:
    """해당 날짜 기사를 필터링·페이지 분할해 반환한다.

    날짜 파일이 없거나 기사가 0건이면 articles=[] 를 반환한다(프론트가 빈 상태를 표시).
    """
    articles = _filter_articles(_load_day_articles(req.date), req.categories, req.query)
    total_hits = len(articles)

    start = req.return_from
    page_articles = articles[start:start + req.page_size]

    return {
        'source': 's3_xml',
        'total_hits': total_hits,
        'articles': [_s3_article_to_response(a) for a in page_articles],
    }


def _s3_article_to_response(a) -> dict:
    """S3Article을 프론트엔드 응답 형태로 변환한다."""
    image_url = None
    if a.images:
        image_url = a.images[0].url
    elif a.content_images:
        image_url = a.content_images[0].url

    return {
        'news_id': a.nsid,
        'title': a.title,
        'published_at': a.published_at,
        'category': a.main_category,
        'provider': a.press,
        'byline': a.author_name,
        'original_link': a.url,
        'content': a.content_clean[:2000] if a.content_clean else '',
        'image_url': image_url,
    }


# ── 조합 ───────────────────────────────────────────────────────────────────

def build_timeline(req: TimelineRequest) -> dict:
    """S3 XML 결과로 타임라인 응답을 만든다(대체 소스 없음). 응답 필드는 프론트와의 계약이다."""
    payload = fetch_from_s3_xml(req)

    total_hits = payload['total_hits']
    payload.update({
        'date': req.date,
        'query': req.query,
        'categories': req.categories,
        'page': req.page,
        'page_size': req.page_size,
        'total_pages': math.ceil(total_hits / req.page_size) if total_hits else 0,
        'mode': req.mode,
    })
    return payload
