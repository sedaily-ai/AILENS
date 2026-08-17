"""
Timeline Handler Lambda Function
`/timeline` (뉴스 타임머신) 화면에 그 날짜의 지면을 돌려준다.

    POST /api/timeline   { "date": "2026-07-31", ... }
    GET  /api/timeline?date=2026-07-31

데이터 소스는 S3(`sedaily-news-xml-storage/daily-xml/{YYYYMMDD}.xml`) 단일이다
— 서울경제 원본 수집 피드. `handlers/s3_articles_handler.py`가 이미 같은
버킷·같은 파서로 배포돼 살아있는 걸 확인하고(2026-08-13) 그 로직을 그대로
재사용한다.

⚠️ 2026-08-13, 빅카인즈(언론진흥재단 OpenAPI) + DynamoDB 폴백 2단계 구조를
걷어내고 이 소스 하나로 단순화했다.
  - 빅카인즈: Lambda(`sedaily-mbti-timeline-dev`)조차 배포된 적이 없어(API
    Gateway 라우트도 없음) 이 엔드포인트 자체가 늘 404였다("타임라인 API
    응답 404"로 프론트에 노출). 실질적으로 한 번도 쓰인 적 없는 코드였다.
  - DynamoDB 폴백: S3 XML은 파이프라인 인덱싱을 기다리지 않고 그날 발행된
    기사가 실시간으로 반영돼(실측: 8/13 당일 기사가 S3 XML엔 있는데
    DynamoDB 검색엔 아직 없었음) 폴백이 필요한 상황 자체가 드물고, 폴백이
    "불러오지 못해 기본 목록을 보여주고 있어요"라는 오해 소지 있는 배너로
    이어지던 문제도 있었다 — 사용자 판단으로 폴백 없이 단일 소스로 정리.

여러 언론사를 넘나드는 빅카인즈와 달리 서울경제 단일 매체 피드라, "그날의
이슈"(다매체 클러스터링) 모드는 이 소스로 재현할 수 없다 — `mode=issues`
요청은 항상 빈 `issues`를 반환한다(요청 파라미터 계약은 유지해 400을 피한다).

프론트엔드: service/frontend/src/features/timeline/lib/timelineApi.ts
"""
import asyncio
import json
import logging
import math
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from clients.s3_xml_client import S3XMLClient
from config.constants import MAX_PAGE_SIZE
from core.decorators import lambda_handler as handler_decorator
from core.response import error_response, no_content_response, success_response

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

KST = timezone(timedelta(hours=9))
DATE_FORMAT = '%Y-%m-%d'

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
    """Lambda 컨테이너당 한 번만 생성 (s3_articles_handler.py와 같은 패턴)."""
    global _s3_xml_client
    if _s3_xml_client is None:
        _s3_xml_client = S3XMLClient()
    return _s3_xml_client


class BadRequest(Exception):
    """400 으로 내려보낼 입력 오류."""


# =============================================================================
# Request
# =============================================================================

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


def _today_kst() -> str:
    return datetime.now(KST).strftime(DATE_FORMAT)


def _validate_date(raw: str) -> str:
    """`YYYY-MM-DD` 검증. 미래 날짜는 오늘로 당긴다 (빈 지면 대신 오늘 지면)."""
    if not raw:
        raise BadRequest('date 파라미터가 필요합니다. (YYYY-MM-DD)')
    try:
        parsed = datetime.strptime(raw, DATE_FORMAT)
    except (ValueError, TypeError):
        raise BadRequest(f'날짜 형식이 올바르지 않습니다: {raw} (YYYY-MM-DD 형식으로 입력해주세요)')

    normalized = parsed.strftime(DATE_FORMAT)
    today = _today_kst()
    if normalized > today:
        logger.info('미래 날짜 요청(%s) → 오늘(%s)로 조정', normalized, today)
        return today
    return normalized


def _parse_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in ('1', 'true', 'yes', 'y')


def _parse_list(value: Any) -> List[str]:
    """리스트 또는 콤마 구분 문자열 → 리스트."""
    if not value:
        return []
    if isinstance(value, list):
        return [str(v).strip() for v in value if str(v).strip()]
    return [v.strip() for v in str(value).split(',') if v.strip()]


def _parse_int(value: Any, default: int) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def parse_request(event: dict) -> TimelineRequest:
    """
    API Gateway 이벤트에서 TimelineRequest 를 만든다. POST 본문과 GET
    쿼리스트링을 모두 받아서 curl 로도 바로 찔러볼 수 있게 한다.
    """
    body: Dict[str, Any] = {}
    raw_body = event.get('body')
    if raw_body:
        if isinstance(raw_body, str):
            try:
                body = json.loads(raw_body)
            except json.JSONDecodeError:
                raise BadRequest('요청 본문이 올바른 JSON 이 아닙니다.')
        elif isinstance(raw_body, dict):
            body = raw_body
    params = event.get('queryStringParameters') or {}

    def pick(*names: str, default: Any = None) -> Any:
        for name in names:
            if name in body and body[name] not in (None, ''):
                return body[name]
            if name in params and params[name] not in (None, ''):
                return params[name]
        return default

    date = _validate_date(str(pick('date', default='') or '').strip())

    query = pick('query', default=None)
    query = str(query).strip() if query else None
    # 프론트엔드가 `/api/search` 관례를 따라 '*' 를 "전체" 의미로 보낸다.
    if query in ('*', ''):
        query = None

    page = max(1, _parse_int(pick('page', default=1), 1))
    page_size = _parse_int(pick('page_size', 'pageSize', default=DEFAULT_PAGE_SIZE), DEFAULT_PAGE_SIZE)
    page_size = max(1, min(page_size, MAX_PAGE_SIZE))

    mode = str(pick('mode', default='flat') or 'flat').strip().lower()
    if mode not in ('flat', 'issues'):
        raise BadRequest(f"mode 는 flat, issues 중 하나입니다: {mode}")

    issue_count = _parse_int(pick('issue_count', 'issueCount', default=DEFAULT_ISSUE_COUNT),
                             DEFAULT_ISSUE_COUNT)
    issue_count = max(1, min(issue_count, MAX_ISSUE_COUNT))

    per_issue = _parse_int(pick('per_issue', 'perIssue', default=DEFAULT_PER_ISSUE),
                           DEFAULT_PER_ISSUE)
    per_issue = max(1, min(per_issue, MAX_PER_ISSUE))

    return TimelineRequest(
        date=date,
        query=query,
        categories=_parse_list(pick('categories', 'category', default=None)),
        page=page,
        page_size=page_size,
        mode=mode,
        issue_count=issue_count,
        per_issue=per_issue,
    )


# =============================================================================
# S3 XML (서울경제 원본 피드)
# =============================================================================

def fetch_from_s3_xml(req: TimelineRequest) -> dict:
    """
    S3(`sedaily-news-xml-storage/daily-xml/{YYYYMMDD}.xml`)에서 해당 일자
    기사를 가져온다. 로직은 `handlers/s3_articles_handler.get_articles_list`와
    동일 — 그 핸들러가 이미 배포·검증된 상태라 여기서도 같은 패턴을 쓴다.
    그 날짜 파일이 없거나 기사가 0건이면 articles=[] 를 그대로 반환한다
    (프론트가 "아직 보관되지 않았어요" 빈 상태를 표시).
    """
    client = _get_s3_xml_client()
    date_str = req.date.replace('-', '')  # S3XMLClient는 YYYYMMDD 키를 쓴다
    articles = asyncio.run(client.get_articles_by_date(date_str))

    # 삭제(action='D') 항목 제외 — s3_articles_handler.py와 동일 규칙.
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
    """S3Article → 프론트엔드 응답 형태 (s3_articles_handler.py의 매핑과 동일)."""
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


# =============================================================================
# Lambda entry point
# =============================================================================

@handler_decorator
def lambda_handler(event: dict, context) -> dict:
    """AWS Lambda / API Gateway 핸들러."""
    method = (
        event.get('requestContext', {}).get('http', {}).get('method')
        or event.get('httpMethod')
        or ''
    ).upper()
    if method == 'OPTIONS':
        return no_content_response()

    try:
        req = parse_request(event)
    except BadRequest as e:
        return error_response(str(e), status_code=400, code='BAD_REQUEST')

    try:
        payload = build_timeline(req)
        logger.info(
            'timeline 응답: date=%s, source=%s, total_hits=%s, returned=%s',
            payload.get('date'), payload.get('source'),
            payload.get('total_hits'), len(payload.get('articles', [])),
        )
        return success_response(payload)
    except Exception as e:  # noqa: BLE001
        logger.error('timeline 오류: %s', e, exc_info=True)
        return error_response(str(e), status_code=500, code='TIMELINE_ERROR')
