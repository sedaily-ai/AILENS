"""
사용자 활동 Lambda 핸들러.

프로필, 읽기 기록, 통계를 처리한다. 프로필 생성·조회, 읽기 기록, 통계, 뱃지 계산 로직은
services/user/profile.py 에 있으며, 이 파일은 HTTP 라우팅과 인증만 담당한다.
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
    - POST /api/user/read - Record article read
    - GET /api/user/history - Get reading history
    - GET /api/user/stats - Get user statistics
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
        if '/profile' in path:
            if http_method == 'POST':
                email = body.get('email')
                name = body.get('name')
                picture = body.get('picture')

                result = asyncio.run(
                    svc.get_or_create_user(user_id, email, name, picture)
                )
                return svc.success_response(result)

        elif '/read' in path and http_method == 'POST':
            article_id = body.get('article_id')
            article_title = body.get('article_title')

            if not article_id:
                return svc.error_response(400, 'article_id is required')

            result = asyncio.run(
                svc.record_article_read(user_id, article_id, article_title)
            )
            return svc.success_response(result)

        elif '/history' in path and http_method == 'GET':
            history = asyncio.run(svc.get_reading_history(user_id))
            return svc.success_response({'history': history})

        elif '/stats' in path:
            stats = asyncio.run(svc.get_user_stats(user_id))
            return svc.success_response(stats)

        else:
            return svc.error_response(404, 'Not found')

    except ValueError as e:
        return svc.error_response(400, str(e))

    except Exception as e:
        logger.error(f"User handler error: {e}", exc_info=True)
        return svc.error_response(500, '서버 오류가 발생했습니다.')
