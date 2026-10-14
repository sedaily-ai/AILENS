"""개인 API 로컬 shim. 운영 .env 자동 로드와 AWS 클라이언트 초기화 없음.

LENS_CMS_API_URL을 loopback 내부 API로 명시해야 시작할 수 있다.
인증은 제품 Lambda의 Cognito ID token 검증을 그대로 사용한다.
"""
import os
from urllib.parse import urlparse
from fastapi import FastAPI, Request
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from handlers.user.dashboard import lambda_handler as dashboard_handler
from handlers.user.archive import lambda_handler as archive_handler

cms = urlparse(os.environ.get('LENS_CMS_API_URL', ''))
if cms.hostname not in ('127.0.0.1', 'localhost', '::1'):
    raise RuntimeError('로컬 검증은 LENS_CMS_API_URL에 loopback URL을 명시해야 합니다.')

app = FastAPI(title='LENS local account API')
app.add_middleware(CORSMiddleware, allow_origins=['http://127.0.0.1:3000', 'http://localhost:3000', 'http://127.0.0.1:3001', 'http://localhost:3001'], allow_methods=['*'], allow_headers=['*'])


async def forward(request: Request, handler):
    event = {'requestContext': {'http': {'method': request.method, 'path': request.url.path}},
             'rawPath': request.url.path, 'headers': dict(request.headers), 'queryStringParameters': dict(request.query_params),
             'body': (await request.body()).decode('utf-8')}
    result = await run_in_threadpool(handler, event, None)
    return Response(result.get('body', ''), status_code=result['statusCode'], headers=result.get('headers', {}))


@app.api_route('/api/v2/me/{path:path}', methods=['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'])
async def dashboard(request: Request):
    return await forward(request, dashboard_handler)


@app.api_route('/api/archive', methods=['GET', 'POST', 'OPTIONS'])
@app.api_route('/api/archive/{path:path}', methods=['GET', 'DELETE', 'OPTIONS'])
async def archive(request: Request):
    return await forward(request, archive_handler)
