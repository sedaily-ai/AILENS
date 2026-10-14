"""개인 대시보드 내부 API. 기존 개인 HTTP 클라이언트·토큰 사용."""
from clients.pg.personal import _request

BASE = '/internal/personal/lens'


def request(method, path, owner, body=None, query=None):
    # 전송 adapter의 connect/read timeout보다 worker HTTP 대기를 길게 둔다.
    timeout=30 if path=='/notifications/send-claim' else 8
    return _request(method, BASE + path, body=body, query={**(query or {}), 'user_id': owner},timeout_seconds=timeout)
