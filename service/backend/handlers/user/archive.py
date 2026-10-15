"""
Archive Handler — "내 서랍" (My Drawer) API
=============================================
Manages user-archived sentences.

Routes:
  POST   /api/archive          — Save a sentence
  GET    /api/archive          — List archived sentences
  GET    /api/archive/popular  — Popular sentences across all users (public, no auth)
  DELETE /api/archive/{id}     — Delete a sentence

라우트 로직(저장·조회·인기 목록·삭제)과 응답 헬퍼는 services/user/archive.py 에 있으며,
이 파일은 요청 파싱, 인증, 라우팅 분기만 담당한다.
"""
import functools
import base64
import json
import logging

from config.constants import CORS_HEADERS
from core.decorators import lambda_handler as handler_decorator
from core.auth import get_authenticated_user_id
from core.exceptions import AuthenticationError
from services.user import archive as svc

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


# ── Request parsing ──────────────────────────────────────────────────────────

def _parse_event(event: dict):
    """Extract method, path, params, and body from Lambda event."""
    rc = event.get('requestContext', {})

    if 'http' in rc:
        method = rc['http'].get('method', 'GET')
        path = rc['http'].get('path', '')
    else:
        method = event.get('httpMethod', 'GET')
        path = event.get('path', '')

    params = event.get('queryStringParameters', {}) or {}
    path_params = event.get('pathParameters', {}) or {}

    raw_body = event.get('body', '{}')
    if raw_body and event.get('isBase64Encoded', False):
        raw_body = base64.b64decode(raw_body).decode('utf-8')

    if isinstance(raw_body, str) and raw_body:
        body = json.loads(raw_body)
    elif isinstance(raw_body, dict):
        body = raw_body
    else:
        body = {}

    if not isinstance(body,dict):raise ValueError('JSON object required')
    return method, path, params, path_params, body


# ── Lambda entry point ───────────────────────────────────────────────────────

def _personal_cache(handler):
    @functools.wraps(handler)
    def wrapped(event, context):
        response = handler(event, context)
        rc = event.get('requestContext') or {}
        method = (rc.get('http') or {}).get('method', event.get('httpMethod', 'GET'))
        path = event.get('rawPath') or (rc.get('http') or {}).get('path') or event.get('path', '')
        if not (method == 'GET' and path.rstrip('/').endswith('/api/archive/popular')):
            response.setdefault('headers', {})['Cache-Control'] = 'private, no-store'
        return response
    return wrapped


@_personal_cache
@handler_decorator
async def lambda_handler(event: dict, context) -> dict:
    """
    Archive API Lambda handler.

    Routes:
      POST   /api/archive          — Save a sentence
      GET    /api/archive          — List archived sentences
      GET    /api/archive/popular  — Popular sentences across all users (public)
      DELETE /api/archive/{id}     — Delete a sentence
      POST   /api/archive/similar  — Find similar sentences
    """
    try:
        method, path, params, path_params, body = _parse_event(event)
    except (ValueError,TypeError,UnicodeError):
        return svc.error(400,'JSON 객체로 요청해 주세요.')

    if method == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS_HEADERS, 'body': ''}

    logger.info(f"Archive request: {method} {path}")

    # GET /api/archive/popular: 공개 라우트. 응답이 특정 사용자 기준으로 보이지 않도록 인증을 시도하지 않는다.
    if method == 'GET' and path.rstrip('/').endswith('/api/archive/popular'):
        return await svc.handle_popular(params)

    # 개인 조회·변경 모두 검증된 JWT sub만 사용한다. 공개 인기 문장은 위에서 분리한다.
    if method in ('GET', 'POST', 'DELETE'):
        try:
            verified_user_id = get_authenticated_user_id(event)
        except AuthenticationError as e:
            return svc.error(401, str(e))
        body['user_id'] = verified_user_id
        # DELETE 는 쿼리 파라미터의 user_id 를 쓸 수 있으므로 함께 덮어쓴다.
        params['user_id'] = verified_user_id

    # POST /api/archive/similar: 제공 종료된 기능이며, 저장 라우트로 잘못 처리되지 않도록 명시적으로 차단한다.
    if '/similar' in path:
        return svc.error(410, '유사 문장 검색 기능은 더 이상 제공되지 않습니다.')

    # POST /api/archive — Save
    if method == 'POST':
        return await svc.handle_save(body)

    # GET /api/archive — List
    if method == 'GET':
        response = await svc.handle_list(params)
        response.setdefault('headers', {})['Cache-Control'] = 'private, no-store'
        return response

    # DELETE /api/archive/{id}
    if method == 'DELETE':
        archive_id = path_params.get('archive_id', '')
        if not archive_id:
            # Try extracting from path: /api/archive/{id}
            parts = path.rstrip('/').split('/')
            archive_id = parts[-1] if parts else ''
        user_id = params.get('user_id', '') or body.get('user_id', '')
        return await svc.handle_delete(archive_id, user_id)

    return svc.error(405, 'Method not allowed')
