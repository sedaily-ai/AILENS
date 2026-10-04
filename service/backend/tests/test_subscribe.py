"""구독 API — 오프라인 단위 테스트 (DDB 미접속).

검증 분기(invalid email/no-consent)는 DynamoDB 접근 전에 반환되므로
오프라인에서 그대로 검증. 정상 upsert/unsub 경로는 DDB 필요 → syntax-only.

구독 시 그룹 선택은 없으므로 mbti_group 검증(400)은 없다.
"""
import ast
import json
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.dirname(HERE)  # service/backend
sys.path.insert(0, BACKEND)


def _post(body):
    from handlers.content.subscribe import lambda_handler
    return lambda_handler({"httpMethod": "POST", "rawPath": "/api/v2/subscribe",
                           "body": json.dumps(body)}, None)


def _status(resp):
    return resp.get("statusCode") if isinstance(resp, dict) else None


def test_invalid_email_400():
    assert _status(_post({"email": "nope", "consent": True})) == 400


def test_consent_required_400():
    assert _status(_post({"email": "a@b.com", "consent": False})) == 400


def test_unsubscribe_requires_token_400():
    from handlers.content.subscribe import lambda_handler
    r = lambda_handler({"httpMethod": "GET", "rawPath": "/api/v2/unsubscribe",
                        "queryStringParameters": {}}, None)
    assert _status(r) == 400


def test_email_regex():
    from handlers.content.subscribe import _EMAIL_RE
    assert _EMAIL_RE.match("user@naver.com")
    assert not _EMAIL_RE.match("user@bad")


def test_handler_syntax_ok():
    ast.parse(open(os.path.join(BACKEND, "handlers", "content", "subscribe.py"), encoding="utf-8").read())
