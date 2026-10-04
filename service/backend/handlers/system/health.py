"""v2 health endpoint — GET /api/v2/health.

Lambda 패키징 경로를 종단 간 확인하는 헬스체크. `core.decorators` 데코레이터를 사용하며,
`success_response` 는 envelope 없이 raw dict 를 body 로 반환한다.
"""
from core.decorators import lambda_handler as handler_decorator
from core.response import success_response
from config.constants import CORS_HEADERS


@handler_decorator
async def lambda_handler(event: dict, context) -> dict:
    method = (
        event.get('httpMethod')
        or event.get('requestContext', {}).get('http', {}).get('method')
        or 'GET'
    )

    if method == 'OPTIONS':
        return {'statusCode': 200, 'headers': CORS_HEADERS, 'body': ''}

    return success_response({'status': 'ok', 'version': 'v2'})
