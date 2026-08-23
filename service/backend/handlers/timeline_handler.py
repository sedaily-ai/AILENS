"""
Timeline Handler Lambda Function
`/timeline` (뉴스 타임머신) 화면에 그 날짜의 지면을 돌려준다.

    POST /api/timeline   { "date": "2026-07-31", ... }
    GET  /api/timeline?date=2026-07-31

⚠️ 2026-08-13, 빅카인즈(언론진흥재단 OpenAPI) + DynamoDB 폴백 2단계 구조를
걷어내고 S3 XML 원본 피드 하나로 단순화했다.
  - 빅카인즈: Lambda(`sedaily-mbti-timeline-dev`)조차 배포된 적이 없어(API
    Gateway 라우트도 없음) 이 엔드포인트 자체가 늘 404였다("타임라인 API
    응답 404"로 프론트에 노출). 실질적으로 한 번도 쓰인 적 없는 코드였다.
  - DynamoDB 폴백: S3 XML은 파이프라인 인덱싱을 기다리지 않고 그날 발행된
    기사가 실시간으로 반영돼(실측: 8/13 당일 기사가 S3 XML엔 있는데
    DynamoDB 검색엔 아직 없었음) 폴백이 필요한 상황 자체가 드물고, 폴백이
    "불러오지 못해 기본 목록을 보여주고 있어요"라는 오해 소지 있는 배너로
    이어지던 문제도 있었다 — 사용자 판단으로 폴백 없이 단일 소스로 정리.

프론트엔드: service/frontend/src/features/timeline/lib/timelineApi.ts

2026-08-24 — 실제 조회 로직(S3 XML fetch·응답 shaping·orchestration)은
services/timeline_service.py로 뺐다(코드 리팩토링 감사 Track B, God 파일
분해). 이 파일은 이제 HTTP 요청 파싱(쿼리스트링/바디 → TimelineRequest)과
라우팅만 담당한다.
"""
import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List

from config.constants import MAX_PAGE_SIZE
from core.decorators import lambda_handler as handler_decorator
from core.response import error_response, no_content_response, success_response
from services.timeline_service import (
    DEFAULT_ISSUE_COUNT,
    DEFAULT_PAGE_SIZE,
    DEFAULT_PER_ISSUE,
    MAX_ISSUE_COUNT,
    MAX_PER_ISSUE,
    TimelineRequest,
    build_timeline,
)

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)

KST = timezone(timedelta(hours=9))
DATE_FORMAT = '%Y-%m-%d'


class BadRequest(Exception):
    """400 으로 내려보낼 입력 오류."""


# =============================================================================
# Request parsing
# =============================================================================

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
