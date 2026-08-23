"""Timeline("뉴스 타임머신") 비즈니스 로직 — handlers/timeline_handler.py에서
추출 (2026-08-24, 코드 리팩토링 감사 Track B, God 파일 분해).

데이터 소스는 S3(`sedaily-news-xml-storage/daily-xml/{YYYYMMDD}.xml`) 단일이다
— 서울경제 원본 수집 피드. `handlers/s3_articles_handler.py`(현재는
`services/s3_articles_service.py`)가 이미 같은 버킷·같은 파서로 배포돼 살아있는
걸 확인하고(2026-08-13) 그 로직을 그대로 재사용한다.

여러 언론사를 넘나드는 빅카인즈와 달리 서울경제 단일 매체 피드라, "그날의
이슈"(다매체 클러스터링) 모드는 이 소스로 재현할 수 없다 — `mode=issues`
요청은 항상 빈 `issues`를 반환한다(요청 파라미터 계약은 유지해 400을 피한다).
"""
import asyncio
import logging
import math
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from clients.s3_xml_client import S3XMLClient

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

DEFAULT_PAGE_SIZE = 30

# issues 모드 파라미터 — 클러스터링을 만들어낼 소스가 없어(위 docstring 참조)
# 항상 빈 issues 를 반환하지만, 요청 파싱/검증 계약은 그대로 유지한다
# (프론트가 이 파라미터들을 계속 보내도 400 이 나지 않게).
DEFAULT_ISSUE_COUNT = 8
MAX_ISSUE_COUNT = 30
DEFAULT_PER_ISSUE = 4
MAX_PER_ISSUE = 20

_s3_xml_client: Optional[S3XMLClient] = None


def _get_s3_xml_client() -> S3XMLClient:
    """Lambda 컨테이너당 한 번만 생성 (s3_articles_service.py와 같은 패턴)."""
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
    # 'flat'   — 그날 기사를 최신순 한 줄로 (기본, 기존 동작)
    # 'issues' — 다매체 클러스터링. 소스가 없어 항상 빈 값(위 docstring 참조).
    mode: str = 'flat'
    issue_count: int = DEFAULT_ISSUE_COUNT
    per_issue: int = DEFAULT_PER_ISSUE

    @property
    def return_from(self) -> int:
        return (self.page - 1) * self.page_size

    @property
    def is_issues(self) -> bool:
        return self.mode == 'issues'


# =============================================================================
# S3 XML (서울경제 원본 피드)
# =============================================================================

def fetch_from_s3_xml(req: TimelineRequest) -> dict:
    """
    S3(`sedaily-news-xml-storage/daily-xml/{YYYYMMDD}.xml`)에서 해당 일자
    기사를 가져온다. 로직은 `services/s3_articles_service.get_articles_list`와
    동일 — 그 핸들러가 이미 배포·검증된 상태라 여기서도 같은 패턴을 쓴다.
    그 날짜 파일이 없거나 기사가 0건이면 articles=[] 를 그대로 반환한다
    (프론트가 "아직 보관되지 않았어요" 빈 상태를 표시).
    """
    client = _get_s3_xml_client()
    date_str = req.date.replace('-', '')  # S3XMLClient는 YYYYMMDD 키를 쓴다
    articles = asyncio.run(client.get_articles_by_date(date_str))

    # 삭제(action='D') 항목 제외 — s3_articles_service.py와 동일 규칙.
    articles = [a for a in articles if a.action != 'D']

    if req.categories:
        articles = [a for a in articles if a.main_category in req.categories]

    # query 는 제목/본문 부분 문자열 매칭으로 처리한다 (S3 XML엔 검색 엔진이 없음).
    if req.query:
        q = req.query.lower()
        articles = [
            a for a in articles
            if q in a.title.lower() or q in (a.content_clean or '').lower()
        ]

    articles.sort(key=lambda a: a.published_at, reverse=True)
    total_hits = len(articles)

    start = req.return_from
    page_articles = articles[start:start + req.page_size]

    return {
        'source': 's3_xml',
        'total_hits': total_hits,
        'articles': [_s3_article_to_response(a) for a in page_articles],
    }


def _s3_article_to_response(a) -> dict:
    """S3Article → 프론트엔드 응답 형태 (s3_articles_service.py의 매핑과 동일)."""
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


# =============================================================================
# Orchestration
# =============================================================================

def build_timeline(req: TimelineRequest) -> dict:
    """
    issues 모드는 클러스터링 소스가 없어 조회 자체를 건너뛰고 빈 값을 반환한다
    (위 모듈 docstring 참조). flat 모드는 S3 XML을 그대로 돌려준다 — 폴백 없음.
    """
    if req.is_issues:
        payload: Dict[str, Any] = {'source': 's3_xml', 'total_hits': 0, 'articles': []}
    else:
        payload = fetch_from_s3_xml(req)

    total_hits = payload.get('total_hits') or 0
    payload.update({
        'date': req.date,
        'query': req.query,
        'categories': req.categories,
        'page': req.page,
        'page_size': req.page_size,
        'total_pages': math.ceil(total_hits / req.page_size) if total_hits else 0,
        'mode': req.mode,
    })
    if req.is_issues:
        payload['per_issue'] = req.per_issue
    payload.setdefault('issues', None)
    return payload
