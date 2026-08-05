"""v2 health endpoint — GET /api/v2/health.

Proves the v2 Lambda packaging path end-to-end: v1 + v2 source in one zip,
v1 decorator reused from `core.decorators`, response shape unchanged by
`success_response` (no envelope — body is the raw dict).
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
