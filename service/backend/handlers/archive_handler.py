"""
Archive Handler — "내 서랍" (My Drawer) API
=============================================
Manages user-archived sentences.

Routes:
  POST   /api/archive          — Save a sentence
  GET    /api/archive          — List archived sentences
  GET    /api/archive/popular  — Popular sentences across all users (public, no auth)
  DELETE /api/archive/{id}     — Delete a sentence

Replaces the frontend's Mock data (React state, 8 sample sentences).

2026-08-24 — 실제 라우트 로직(저장/조회/인기목록/삭제)과 응답 헬퍼는
services/archive_service.py로 뺐다(코드 리팩토링 감사 Track B, God 파일
분해). 이 파일은 이제 요청 파싱, 인증, 라우팅 분기만 담당한다.
"""
import base64
import json
import logging

from config.constants import CORS_HEADERS
from core.decorators import lambda_handler as handler_decorator
from core.auth import get_authenticated_user_id, try_get_authenticated_user_id
from core.exceptions import AuthenticationError
from services import archive_service as svc

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

    return method, path, params, path_params, body


# ── Lambda entry point ───────────────────────────────────────────────────────

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
    method, path, params, path_params, body = _parse_event(event)

    if method == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS_HEADERS, 'body': ''}

    logger.info(f"Archive request: {method} {path}")

    # GET /api/archive/popular — 완전 공개. 인증 시도조차 안 한다(다른
    # 라우트처럼 anon_user_id를 붙이면 응답이 그 유저 것으로 스코프된다는
    # 오해를 살 수 있어 명시적으로 분리).
    if method == 'GET' and '/popular' in path:
        return await svc.handle_popular(params)

    # All write operations need an authenticated user. Reads (similarity
    # search, list) accept either an authenticated user (scoped to their
    # own archive) or anonymous (returns nothing for now). Replace any
    # client-supplied user_id with the JWT `sub` for write paths.
    if method in ('POST', 'DELETE'):
        try:
            verified_user_id = get_authenticated_user_id(event)
        except AuthenticationError as e:
            return svc.error(401, str(e))
        body['user_id'] = verified_user_id
        # Also override query-param user_id since DELETE may use it.
        params['user_id'] = verified_user_id
    else:
        # GET — try to attach a verified user_id but don't require it. The
        # repository layer scopes to user_id when present.
        anon_user_id = try_get_authenticated_user_id(event)
        if anon_user_id:
            params['user_id'] = anon_user_id

    # POST /api/archive/similar — 2026-08-06 제거(pgvector RDS 없음). 저장으로
    # 잘못 떨어지지 않도록 명시적으로 막는다.
    if '/similar' in path:
        return svc.error(410, '유사 문장 검색 기능은 더 이상 제공되지 않습니다.')

    # POST /api/archive — Save
    if method == 'POST':
        return await svc.handle_save(body)

    # GET /api/archive — List
    if method == 'GET':
        return await svc.handle_list(params)

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
