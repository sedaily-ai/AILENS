"""프론트 배포 전 공개 계정 API 인수 게이트. 토큰/응답 본문을 출력하지 않는다."""
import argparse
import json
from pathlib import Path
import urllib.error
import urllib.request
from urllib.parse import urlsplit


def request(base, path, method='GET', token=None):
    headers = {'Origin': 'https://ailens.sedaily.ai', 'Cache-Control': 'no-cache'}
    if token:
        headers['Authorization'] = 'Bearer ' + token
    if method == 'OPTIONS':
        headers.update({'Access-Control-Request-Method': 'PUT', 'Access-Control-Request-Headers': 'authorization,content-type'})
    req = urllib.request.Request(base.rstrip('/') + path, method=method, headers=headers)
    try:
        response = urllib.request.urlopen(req, timeout=35)
    except urllib.error.HTTPError as exc:
        response = exc
    with response:
        return response.status, response.headers, response.read(1_000_000)


def smoke(base, token):
    for path in ('/api/v2/me/preferences', '/api/v2/me/dashboard', '/api/archive'):
        status, headers, _ = request(base, path)
        if status != 401 or 'no-store' not in headers.get('Cache-Control', '') or 'private' not in headers.get('Cache-Control', ''):
            raise RuntimeError('무인증/private/no-store 계약 확인 실패')
        status, headers, body = request(base, path, token=token)
        if status != 200 or 'no-store' not in headers.get('Cache-Control', '') or 'private' not in headers.get('Cache-Control', ''):
            raise RuntimeError('인증 계정/private/no-store 계약 확인 실패')
        data=json.loads(body)
        if path.endswith('/preferences') and (type(data.get('revision')) is not int or not isinstance(data.get('interests'),list)):
            raise RuntimeError('계정 설정 응답 계약 확인 실패')
        # format_preference·notifications는 조회하지 않는 호환용 키(unavailable)라 연결 확인 대상이 아니다.
        # saved_letters는 계정 API가 CMS에 따로 묻는 영역이라, ready면 계정 API→CMS 연결이 살아 있다는 뜻이다.
        if path.endswith('/dashboard') and (data.get('scope') != 'account' or data.get('schema_version') != 1 or any(data.get(key,{}).get('status') != 'ready' for key in ('preferences','saved_letters'))):
            raise RuntimeError('대시보드 주요 영역 연결 확인 실패')
        if path=='/api/archive' and not isinstance(data.get('sentences'),list):
            raise RuntimeError('서랍 응답 계약 확인 실패')
    status, headers, _ = request(base, '/api/v2/me/preferences', method='OPTIONS')
    if status not in (200, 204) or headers.get('Access-Control-Allow-Origin') not in ('*', 'https://ailens.sedaily.ai') or 'PUT' not in headers.get('Access-Control-Allow-Methods', '') or 'authorization' not in headers.get('Access-Control-Allow-Headers', '').lower():
        raise RuntimeError('실제 origin PUT/Authorization CORS 확인 실패')


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--base', required=True)
    parser.add_argument('--token-file', type=Path, required=True)
    args = parser.parse_args()
    try:
        url = urlsplit(args.base)
        if url.scheme != 'https' or url.username or url.password or url.query or url.fragment:
            raise RuntimeError('자격증명 없는 HTTPS 공개 API URL 필요')
        if not str(args.token_file).startswith('/tmp/') or args.token_file.stat().st_mode & 0o077:
            raise RuntimeError('/tmp의 권한 600 ID token 파일 필요')
        token = args.token_file.read_text().strip()
        if not token or len(token) > 16384:
            raise RuntimeError('실제 Cognito ID token 필요')
        smoke(args.base, token)
        print('공개 계정 API 인증·CORS·private/no-store 확인 통과')
    except Exception:
        raise SystemExit('공개 API 인수 실패 — 프론트 배포 중단. 인증·경로·헤더·Lambda 로그를 확인하세요.') from None
