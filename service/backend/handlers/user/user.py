"""
사용자 Lambda 핸들러.

로그인 때 프로필 생성·동기화(POST /api/user/profile)만 처리한다. 로직은 services/user/profile.py 에 있으며,
이 파일은 HTTP 라우팅과 인증만 담당한다.
"""
import logging
import json
import base64
import asyncio

from core.auth import get_authenticated_user_id
from core.exceptions import AuthenticationError
from config.constants import CORS_HEADERS
from services.user import profile as svc

logger = logging.getLogger(__name__)
logger.setLevel(logging.INFO)


def lambda_handler(event: dict, context) -> dict:
    """
    Lambda handler for user API.

    Routes:
    - POST /api/user/profile - Get or create user profile (requires auth)

    POST /api/user/read, GET /api/user/history, GET /api/user/stats 는 2026-10-20 기능 다이어트로 지웠다
    (웹·앱 호출 0). API Gateway 경로가 남아 있어도 아래 404로 끝난다.
    """
    try:
        # Parse request
        request_context = event.get('requestContext', {})

        if 'http' in request_context:
            http_method = request_context['http'].get('method', 'GET')
            path = request_context['http'].get('path', '')
        else:
            http_method = event.get('httpMethod', 'GET')
            path = event.get('path', '')

        # Handle CORS preflight
        if http_method == 'OPTIONS':
            return {
                'statusCode': 200,
                'headers': CORS_HEADERS,
                'body': ''
            }

        # Parse body
        body = event.get('body', '{}')
        is_base64 = event.get('isBase64Encoded', False)

        if body and is_base64:
            body = base64.b64decode(body).decode('utf-8')

        if isinstance(body, str) and body:
            body = json.loads(body)
        elif not body:
            body = {}

        # user_id 는 검증된 Cognito ID 토큰에서만 가져온다(요청 바디·쿼리스트링 값은 신뢰하지 않는다).
        try:
            user_id = get_authenticated_user_id(event)
        except AuthenticationError as e:
            return svc.error_response(401, str(e))

        logger.info(f"User request: {http_method} {path} user={user_id}")

        # Route handling
        if '/profile' in path and http_method == 'POST':
            email = body.get('email')
            name = body.get('name')
            picture = body.get('picture')

            result = asyncio.run(
                svc.get_or_create_user(user_id, email, name, picture)
            )
            return svc.success_response(result)

        return svc.error_response(404, 'Not found')

    except ValueError as e:
        return svc.error_response(400, str(e))

    except Exception as e:
        logger.error(f"User handler error: {e}", exc_info=True)
        return svc.error_response(500, '서버 오류가 발생했습니다.')
