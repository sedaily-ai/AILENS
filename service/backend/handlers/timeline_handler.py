"""
Timeline Handler Lambda Function
`/timeline` (뉴스 타임머신) 화면에 그 날짜의 지면을 돌려준다.

    POST /api/timeline   { "date": "2026-07-31", ... }
    GET  /api/timeline?date=2026-07-31

데이터 소스는 2단계다.

    1순위  빅카인즈 OpenAPI (`clients/bigkinds_client.py`)
           — 언론진흥재단 뉴스 아카이브. 서울경제뿐 아니라 전체 언론사 지면을
             과거까지 거슬러 조회할 수 있어 "타임머신" 에 맞는 소스다.
    2순위  DynamoDB (`handlers/search_handler.search_dynamodb_optimized`)
           — 기존 `/api/search` 가 쓰던 경로. 서울경제 기사만 있고, 파이프라인이
             수집한 시점 이후 날짜만 존재한다.

빅카인즈가 실패하거나(키 미설정·인증 실패·타임아웃) 0건이면 DynamoDB 로 내려간다.
즉 이 엔드포인트는 기존 타임라인 동작을 깎지 않는다. 응답의 `source` 로 실제로
어느 쪽이 답했는지 항상 알 수 있고, 폴백한 경우 `fallback_reason` 에 사유가 담긴다.

프론트엔드: service/frontend/src/components/timeline/NewsTimeMachine.tsx
"""
import json
import logging
import math
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from clients.bigkinds_client import (
    BigKindsClient,
    BigKindsError,
    exclusive_until,
    standard_to_bigkinds_categories,
)
from config.constants import (
    BIGKINDS_PROVIDER_SEDAILY,
    CORS_HEADERS,
    MAX_PAGE_SIZE,
    TIMELINE_INDICATOR_WINDOW_DAYS,
)
from services.day_indicator_service import (
    build_indicator_query,
    pick_indicator_headlines,
)
from services.issue_digest_service import build_issue_digest

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

KST = timezone(timedelta(hours=9))
DATE_FORMAT = '%Y-%m-%d'

DEFAULT_PAGE_SIZE = 30
# 키워드 트렌드 스파크라인에 쓸 구간 (대상일 기준 최근 30일)
TREND_WINDOW_DAYS = 30

# ── issues 모드 ─────────────────────────────────────────────────────────────
# 화면에 띄울 이슈 카드 수. 빅카인즈는 하루 30개를 주지만(지침서는 10개라고 하나
# 실측 30개) 상위 몇 개가 실제 '그날의 이슈'다.
DEFAULT_ISSUE_COUNT = 8
MAX_ISSUE_COUNT = 30
# 이슈 카드 하나에 실을 기사 수
DEFAULT_PER_ISSUE = 4
MAX_PER_ISSUE = 20
# 이슈 하나에서 상세 조회할 기사 수 상한.
# 큰 이슈는 클러스터가 227건까지 간다(2020-03-19 코로나). 전부 조회하면 응답이
# 느려지고 UI 에 쓰지도 않는다 — **보도량 숫자는 클러스터 크기(article_count)로
# 정확히** 내보내고, 제목·언론사 분포는 이 상한만큼의 표본으로 만든다.
# 그래서 응답의 provider 분포는 `resolved_count` 기준임을 명시한다.
MAX_IDS_PER_ISSUE = 30
# 상세 조회 배치 전체 상한 (실측: 300건 요청 → 283건 수신 OK)
MAX_DETAIL_IDS = 240


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
    providers: List[str] = field(default_factory=list)
    page: int = 1
    page_size: int = DEFAULT_PAGE_SIZE
    include_trend: bool = False
    # 'flat'   — 그날 기사를 최신순 한 줄로 (기본, 기존 동작)
    # 'issues' — 그날 언론이 가장 많이 다룬 이슈 + 언론사별 보도 분포 (B안)
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
    # 빅카인즈에서 '*' 는 그냥 검색어라 0건이 나오므로 검색어 없음으로 바꾼다.
    if query in ('*', ''):
        query = None

    all_press = _parse_bool(pick('all_press', 'all_providers', default=False))
    providers = _parse_list(pick('providers', 'provider', default=None))
    if not providers and not all_press:
        # 지면 브랜딩(서울경제 보관본) 유지를 위한 기본값.
        providers = [BIGKINDS_PROVIDER_SEDAILY]
    if all_press:
        providers = []  # provider 미지정 = 전체 언론사

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
        providers=providers,
        page=page,
        page_size=page_size,
        include_trend=_parse_bool(pick('include_trend', 'trend', default=False)),
        mode=mode,
        issue_count=issue_count,
        per_issue=per_issue,
    )


# =============================================================================
# Source 1 — 빅카인즈
# =============================================================================

def fetch_from_bigkinds(req: TimelineRequest, client: Optional[BigKindsClient] = None) -> dict:
    """
    빅카인즈에서 해당 일자 기사를 가져온다.

    Raises:
        BigKindsError: 키 미설정·인증 실패·전송 실패 등 (호출자가 폴백 판단)
    """
    client = client or BigKindsClient()

    result = client.search_single_day(
        req.date,
        query=req.query,
        providers=req.providers or None,
        categories=standard_to_bigkinds_categories(req.categories) or None,
        return_from=req.return_from,
        return_size=req.page_size,
        hilight=200,
    )

    payload: Dict[str, Any] = {
        'source': 'bigkinds',
        'total_hits': result.total_hits,
        'articles': [_to_response_article(a) for a in result.articles],
    }

    # 키워드 트렌드(§6)는 query 가 필수다. 검색어가 있을 때만 곁들인다.
    if req.include_trend and req.query:
        payload['trend'] = _fetch_trend(client, req)

    return payload


def fetch_issues_from_bigkinds(
    req: TimelineRequest,
    client: Optional[BigKindsClient] = None,
) -> dict:
    """
    그날의 이슈 (B안) — 빅카인즈 호출 **2회**로 만든다.

      1) `/issue_ranking` — 하루 이슈를 보도량 내림차순으로. 각 이슈에 기사 id 묶음.
      2) `/search/news` (news_ids 배치) — 상위 이슈들의 기사 제목·언론사를 한 번에.

    이슈는 "여러 매체가 같이 다뤘다"는 사실 자체가 정의라서 **언론사 필터를 걸지
    않는다**(providers 무시). 대신 각 이슈에서 서울경제 기사를 따로 뽑아
    (`sedaily`) 지면 정체성과 이어붙인다.

    Raises:
        BigKindsError: 호출자가 폴백 판단
    """
    client = client or BigKindsClient()

    topics = client.issue_ranking(req.date)
    topics = topics[:req.issue_count]
    if not topics:
        return {'source': 'bigkinds', 'issues': [], 'total_hits': 0, 'articles': []}

    # 상위 이슈들의 기사 id 를 모아 한 번에 상세 조회.
    # 이슈별 상한을 먼저 걸어 큰 이슈 하나가 배치를 다 먹지 않게 한다
    # (2020-03-19 '코로나19' 클러스터가 227건이라 그냥 모으면 나머지 이슈가 밀린다).
    ids: List[str] = []
    seen = set()
    for topic in topics:
        for news_id in topic.news_ids[:MAX_IDS_PER_ISSUE]:
            if news_id not in seen:
                seen.add(news_id)
                ids.append(news_id)
    truncated = len(ids) > MAX_DETAIL_IDS
    ids = ids[:MAX_DETAIL_IDS]

    details = client.get_news_detail(ids, fields=[
        'news_id', 'title', 'published_at', 'provider', 'category',
        'provider_link_page',
    ])
    articles_by_id = {a.news_id: a for a in details}
    if truncated:
        logger.info('상세 조회 id 상한 적용: %s → %s건', len(seen), MAX_DETAIL_IDS)

    issues = build_issue_digest(
        topics, articles_by_id, per_issue=req.per_issue
    )

    return {
        'source': 'bigkinds',
        'issues': issues,
        'indicators': _fetch_indicators(client, req),
        # 이슈 모드의 total_hits 는 "상위 이슈들의 보도량 합"으로 읽는다.
        'total_hits': sum(i['article_count'] for i in issues),
        # flat 목록도 채워둔다 — 프론트의 빈-결과 판정과 폴백 로직이 이걸 본다.
        'articles': [
            _to_response_article(a) for a in list(articles_by_id.values())[:req.page_size]
        ],
    }


def _fetch_indicators(client: BigKindsClient, req: TimelineRequest) -> List[dict]:
    """
    그 무렵의 경제지표 — 지표별 대표 기사 한 건씩. 빅카인즈 **1회 추가 호출**.

    숫자를 우리가 만들지 않고 그 무렵 보도된 제목을 그대로 쓴다 (사유는
    `services/day_indicator_service.py` 독스트링 참조).

    실패해도 이슈 목록을 깨지 않는다 — 보조 카드다.
    """
    try:
        start = (
            datetime.strptime(req.date, DATE_FORMAT)
            - timedelta(days=TIMELINE_INDICATOR_WINDOW_DAYS - 1)
        ).strftime(DATE_FORMAT)
        result = client.search_news(
            query=build_indicator_query(),
            date_from=start,
            date_until=exclusive_until(req.date),
            sort={'date': 'desc'},
            return_size=100,
            fields=['news_id', 'title', 'published_at', 'provider',
                    'category', 'provider_link_page'],
        )
        return pick_indicator_headlines(result.articles)
    except BigKindsError as e:
        logger.warning('그 무렵 지표 조회 실패 (이슈 목록은 유지): %s', e)
        return []


def _fetch_trend(client: BigKindsClient, req: TimelineRequest) -> Optional[dict]:
    """대상일 기준 최근 30일 일별 보도량. 실패해도 본문 조회를 깨지 않는다."""
    try:
        start = (
            datetime.strptime(req.date, DATE_FORMAT) - timedelta(days=TREND_WINDOW_DAYS - 1)
        ).strftime(DATE_FORMAT)
        trend = client.keyword_trend(
            query=req.query,
            date_from=start,
            date_until=exclusive_until(req.date),
            interval='day',
            providers=req.providers or None,
            categories=standard_to_bigkinds_categories(req.categories) or None,
        )
        return trend.to_dict()
    except BigKindsError as e:
        logger.warning('키워드 트렌드 조회 실패 (본문 조회는 유지): %s', e)
        return None


def _to_response_article(a) -> dict:
    """BigKindsArticle → 프론트엔드 응답 형태."""
    return {
        'news_id': a.news_id,
        'title': a.title,
        'published_at': a.published_at,
        'category': a.category,
        'provider': a.provider,
        'byline': a.byline,
        'original_link': a.original_link,
        'content': a.hilight,
        'image_url': None,  # 빅카인즈는 공개 이미지 URL 을 주지 않는다 (경로 조각만)
        'image_path': a.image_path,
    }


# =============================================================================
# Source 2 — DynamoDB 폴백
# =============================================================================

def fetch_from_dynamodb(req: TimelineRequest) -> dict:
    """
    기존 `/api/search` 경로를 그대로 재사용한다. 빅카인즈가 못 답할 때의 안전망.
    `search_handler` 를 지연 import 해서 빅카인즈 경로가 성공하는 동안에는
    boto3/DynamoDB 를 건드리지 않는다.
    """
    from handlers.search_handler import search_dynamodb_optimized

    response = search_dynamodb_optimized(
        query=req.query or '',
        published_from=req.date,
        # search_dynamodb_optimized 는 published_at BETWEEN 이라 경계가 inclusive 다.
        # 빅카인즈의 exclusive until 과 같은 하루 범위를 만들기 위해 +1일 한다.
        published_until=exclusive_until(req.date),
        categories=req.categories,
        page=req.page,
        page_size=req.page_size,
    )

    articles = [
        {
            'news_id': a.get('news_id'),
            'title': a.get('title', ''),
            'published_at': a.get('published_at'),
            'category': a.get('category', ''),
            'provider': a.get('provider', BIGKINDS_PROVIDER_SEDAILY),
            'byline': a.get('byline', ''),
            'original_link': a.get('original_link') or '',
            'content': a.get('content', ''),
            'image_url': a.get('image_url'),
            'image_path': '',
        }
        for a in response.articles
    ]

    return {
        'source': 'dynamodb',
        'total_hits': response.total_hits,
        'articles': articles,
    }


# =============================================================================
# Orchestration
# =============================================================================

def build_timeline(req: TimelineRequest, client: Optional[BigKindsClient] = None) -> dict:
    """빅카인즈 우선, 실패/0건이면 DynamoDB. 어느 쪽이 답했는지 응답에 남긴다."""
    payload: Optional[dict] = None
    fallback_reason: Optional[str] = None

    try:
        payload = (
            fetch_issues_from_bigkinds(req, client=client)
            if req.is_issues
            else fetch_from_bigkinds(req, client=client)
        )
        if not payload['articles']:
            fallback_reason = '빅카인즈에 해당 일자 기사가 없습니다.'
            logger.info('빅카인즈 0건 (date=%s) → DynamoDB 폴백', req.date)
            payload = None
    except BigKindsError as e:
        # 키 미설정/인증 실패/타임아웃 모두 여기로 온다. 서비스는 계속돼야 한다.
        fallback_reason = str(e)
        logger.warning('빅카인즈 조회 실패 → DynamoDB 폴백: %s', e)
    except Exception as e:  # noqa: BLE001 — 예상 못한 오류도 폴백으로 흡수
        fallback_reason = f'빅카인즈 조회 중 예기치 못한 오류: {e}'
        logger.error('빅카인즈 조회 예외 → DynamoDB 폴백: %s', e, exc_info=True)

    if payload is None:
        payload = fetch_from_dynamodb(req)
        payload['fallback_reason'] = fallback_reason

    total_hits = payload.get('total_hits') or 0
    payload.update({
        'date': req.date,
        'query': req.query,
        'providers': req.providers,
        'categories': req.categories,
        'page': req.page,
        'page_size': req.page_size,
        'total_pages': math.ceil(total_hits / req.page_size) if total_hits else 0,
        'mode': req.mode,
    })
    if req.is_issues:
        payload['per_issue'] = req.per_issue
    payload.setdefault('trend', None)
    # issues 모드에서 DynamoDB 로 폴백하면 이슈를 만들 수 없다 — 빅카인즈
    # `/issue_ranking` 에만 있는 클러스터링이라 대체 소스가 없다.
    payload.setdefault('issues', None)
    payload.setdefault('indicators', [])
    return payload


# =============================================================================
# Lambda entry point
# =============================================================================

def lambda_handler(event: dict, context) -> dict:
    """AWS Lambda / API Gateway 핸들러."""
    method = (
        event.get('requestContext', {}).get('http', {}).get('method')
        or event.get('httpMethod')
        or ''
    ).upper()
    if method == 'OPTIONS':
        return _response(204, {})

    try:
        req = parse_request(event)
    except BadRequest as e:
        return _response(400, {'error': {'code': 'BAD_REQUEST', 'message': str(e)}})

    try:
        payload = build_timeline(req)
        logger.info(
            'timeline 응답: date=%s, source=%s, total_hits=%s, returned=%s',
            payload.get('date'), payload.get('source'),
            payload.get('total_hits'), len(payload.get('articles', [])),
        )
        return _response(200, payload)
    except Exception as e:  # noqa: BLE001
        logger.error('timeline 오류: %s', e, exc_info=True)
        return _response(500, {'error': {'code': 'TIMELINE_ERROR', 'message': str(e)}})


def _response(status: int, body: dict) -> dict:
    return {
        'statusCode': status,
        'headers': {**CORS_HEADERS, 'Content-Type': 'application/json; charset=utf-8'},
        'body': json.dumps(body, ensure_ascii=False, default=str),
    }
