"""
Timeline Handler Lambda Function
`/timeline` (뉴스 타임머신) 화면에 그 날짜의 지면을 돌려준다.

    POST /api/timeline   { "date": "2026-07-31", "mode": "flat", "page_size": 30 }
    GET  /api/timeline?date=2026-07-31          (로컬 main.py 전용, 운영 라우트는 POST 만)

    mode 는 'flat' 만 허용한다(그 외 400). query/categories/page 는 선택.
    오류 규약: 400 BAD_REQUEST(입력 오류), 500 TIMELINE_ERROR(내부 오류, 상세는 로그에만).
    '그날 기사 없음'은 오류가 아니라 200 + articles=[].

데이터 소스는 S3 XML 원본 피드 하나이며, 그날 발행된 기사가 실시간으로 반영된다.

프론트엔드: service/frontend/src/features/timeline/lib/timelineApi.ts

조회 로직은 services/timeline/timeline.py 에 있으며, 이 파일은 HTTP 요청 파싱
(쿼리스트링·바디 → TimelineRequest)과 라우팅만 담당한다.
"""
import json
import logging
from typing import Any, Dict

from config.constants import MAX_PAGE_SIZE
from core.decorators import lambda_handler as handler_decorator
from core.response import error_response, no_content_response, success_response
from services.timeline.timeline import (
    DEFAULT_PAGE_SIZE,
    ALLOWED_MODES,
    TimelineRequest,
    build_timeline,
)
from common.dates.validation import BadRequest, validate_date

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


# =============================================================================
# Request parsing
# =============================================================================

def _parse_list(value: Any) -> list:
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
        if not isinstance(body, dict):
            raise BadRequest('요청 본문은 JSON 객체여야 합니다.')
    params = event.get('queryStringParameters') or {}

    def pick(*names: str, default: Any = None) -> Any:
        for name in names:
            if name in body and body[name] not in (None, ''):
                return body[name]
            if name in params and params[name] not in (None, ''):
                return params[name]
        return default

    date = validate_date(str(pick('date', default='') or '').strip())

    query = pick('query', default=None)
    query = str(query).strip() if query else None
    # 프론트엔드가 `/api/search` 관례에 따라 '*' 를 "전체" 의미로 전달한다.
    if query in ('*', ''):
        query = None

    page = max(1, _parse_int(pick('page', default=1), 1))
    page_size = _parse_int(pick('page_size', 'pageSize', default=DEFAULT_PAGE_SIZE), DEFAULT_PAGE_SIZE)
    page_size = max(1, min(page_size, MAX_PAGE_SIZE))

    mode = str(pick('mode', default='flat') or 'flat').strip().lower()
    if mode not in ALLOWED_MODES:
        raise BadRequest(f"mode 는 {', '.join(ALLOWED_MODES)} 중 하나입니다: {mode}")

    return TimelineRequest(
        date=date,
        query=query,
        categories=_parse_list(pick('categories', 'category', default=None)),
        page=page,
        page_size=page_size,
        mode=mode,
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
        return error_response('타임라인을 불러오지 못했습니다.', status_code=500, code='TIMELINE_ERROR')
