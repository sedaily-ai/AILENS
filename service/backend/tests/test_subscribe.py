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



def test_welcome_sent_requires_actual_delivery(monkeypatch):
    from handlers.content import subscribe
    monkeypatch.setattr(subscribe.subscribers_client, "subscribe", lambda *a, **k: {"unsubscribe_token": "test"})
    for status in ("sent", "dry_run", "error", "no_letter"):
        monkeypatch.setattr(subscribe, "_send_specific_letter", lambda *a: status)
        result = json.loads(_post({"email": "audit@example.com", "consent": True, "letter": {"headline": "기사"}})["body"])
        assert result["ok"] is True
        assert result["welcome_sent"] is (status == "sent")
        assert result["send_status"] == status


def test_specific_letter_keeps_publication_date_and_article_path(monkeypatch):
    from handlers.content.subscribe import _send_specific_letter
    from newsletter import sender
    captured = []
    monkeypatch.setattr(sender, "send", lambda *args: captured.append(args) or {"status": "sent"})
    payload = {"headline": "기사", "body": ["실제 기사 요약"], "published_date": "2026-10-12", "article_path": "/industry/2026/10/12/example"}
    assert _send_specific_letter("audit@example.com", "test", payload) == "sent"
    assert "2026-10-12" in captured[0][1]
    assert "/industry/2026/10/12/example?" in captured[0][2]
    assert "실제 기사 요약" in captured[0][2]


def test_specific_letter_falls_back_to_kst_date(monkeypatch):
    from datetime import datetime as real_datetime, timezone
    from handlers.content import subscribe
    from newsletter import sender
    class Clock:
        @staticmethod
        def now(tz):
            return real_datetime(2026, 10, 12, 17, 0, tzinfo=timezone.utc).astimezone(tz)
        strptime = real_datetime.strptime
    monkeypatch.setattr(subscribe, "datetime", Clock)
    captured = []
    monkeypatch.setattr(sender, "send", lambda *a: captured.append(a) or {"status": "sent"})
    for date in (None, "2026-99-99", "bad"):
        assert subscribe._send_specific_letter("audit@example.com", "test", {"headline": "기사", "published_date": date}) == "sent"
        assert "2026-10-13" in captured[-1][1]


def test_mock_fallback_is_never_sent(monkeypatch):
    from handlers.content.subscribe import _send_today_letter
    from newsletter import sender, today_letter
    monkeypatch.setattr(today_letter, "load_today_letter", lambda date: ({"headline": "가짜"}, "mock"))
    def unexpected_send(*args):
        raise AssertionError("mock content must never be emailed")
    monkeypatch.setattr(sender, "send", unexpected_send)
    assert _send_today_letter("audit@example.com", "test") == "no_letter"
