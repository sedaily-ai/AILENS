"""/api/v2/me 계정 저장 공개 Lambda. 신규 API만 새 오류 envelope 사용."""
import base64
import json
import logging
import urllib.error

from config.constants import CORS_HEADERS
from core.auth import get_authenticated_user_id
from core.exceptions import AuthenticationError
from models.dashboard import DashboardError
from services.user.dashboard import dispatch

logger = logging.getLogger(__name__)


def _response(status, data):
    return {'statusCode': status, 'headers': {**CORS_HEADERS, 'Cache-Control': 'private, no-store'},
            'body': json.dumps(data, ensure_ascii=False)}


def _error(status, code, message, request_id):
    return _response(status, {'error': {'code': code, 'message': message, 'retryable': status in (429,503)}, 'request_id': request_id})


def lambda_handler(event, context):
    rc = event.get('requestContext') or {}
    method = (rc.get('http') or {}).get('method', event.get('httpMethod', 'GET'))
    path = event.get('rawPath') or (rc.get('http') or {}).get('path') or event.get('path', '')
    # 이름 있는 스테이지(운영 dev)의 HTTP API는 rawPath 앞에 스테이지가 붙는다(/dev/api/v2/me/...).
    stage = rc.get('stage') or ''
    if stage and stage != '$default' and path.startswith(f'/{stage}/'):
        path = path[len(stage) + 1:]
    request_id = rc.get('requestId', '')
    if method == 'OPTIONS':
        return _response(200, {})
    try:
        owner = get_authenticated_user_id(event)
        if not path.startswith('/api/v2/me/'):
            raise DashboardError(404, 'NOT_FOUND', '지원하지 않는 개인 API예요.')
        raw = event.get('body') or '{}'
        if event.get('isBase64Encoded'):
            raw = base64.b64decode(raw, validate=True).decode('utf-8')
        if not isinstance(raw, str) or len(raw.encode()) > 65536:
            raise DashboardError(413, 'PAYLOAD_TOO_LARGE', '요청이 너무 커요.')
        try:
            body = json.loads(raw)
        except (ValueError, TypeError) as exc:
            raise DashboardError(400, 'INVALID_ARGUMENT', 'JSON 요청을 확인해 주세요.') from exc
        if method in ('POST','PUT') and not isinstance(body,dict):
            raise DashboardError(400,'INVALID_ARGUMENT','JSON 객체로 요청해 주세요.')
        result = dispatch(method, path.removeprefix('/api/v2/me'), owner, body, event.get('queryStringParameters') or {})
        status=201 if method=='POST' and (path.endswith('/activity/sessions') or path.endswith('/push-subscriptions') and result.get('created')) else 200
        return _response(status, result)
    except AuthenticationError:
        return _error(401, 'AUTH_REQUIRED', '로그인을 다시 확인해 주세요.', request_id)
    except DashboardError as exc:
        return _error(exc.status, exc.code, exc.message, request_id)
    except urllib.error.HTTPError as exc:
        # 내부 400/403/404/409만 전달. 내부 인증/DB/validation 실패는 503.
        if exc.code in (400, 403, 404, 409, 429):
            try:
                detail = json.loads(exc.read(8192)).get('detail')
                if isinstance(detail, dict) and isinstance(detail.get('code'), str) and isinstance(detail.get('message'), str):
                    return _error(exc.code, detail['code'], detail['message'], request_id)
            except (ValueError, TypeError):
                pass
        logger.warning('Dashboard dependency HTTP status=%s', exc.code)
        return _error(503, 'DEPENDENCY_UNAVAILABLE', '저장 서버를 사용할 수 없어요. 다시 시도해 주세요.', request_id)
    except (ValueError, UnicodeError):
        return _error(400, 'INVALID_ARGUMENT', '요청을 확인해 주세요.', request_id)
    except Exception:
        logger.exception('Dashboard operation failed')
        return _error(503, 'DEPENDENCY_UNAVAILABLE', '저장 서버를 사용할 수 없어요. 다시 시도해 주세요.', request_id)
