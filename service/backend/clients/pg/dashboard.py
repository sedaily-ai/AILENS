"""개인 대시보드 내부 API. 기존 개인 HTTP 클라이언트·토큰 사용."""
from clients.pg.personal import _request

BASE = '/internal/personal/lens'


def request(method, path, owner, body=None, query=None):
    # 알림 워커의 send-claim 전용 30초 대기는 워커와 함께 지웠다(2026-10-20 기능 다이어트로 알림 워커 제거).
    return _request(method, BASE + path, body=body, query={**(query or {}), 'user_id': owner})
