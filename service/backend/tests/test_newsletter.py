"""뉴스레터 Phase 1 — 오프라인 단위 테스트 (AWS 미접속).

render / subscribers / sender(dry-run) 의 핵심 계약만 검증.
핸들러 전체는 v1 데코레이터 의존이라 syntax-only 로 확인.
"""
import ast
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.dirname(HERE)  # service/backend
sys.path.insert(0, BACKEND)


def test_render_html_contains_letter_and_unsubscribe():
    from newsletter.render import render_html, subject

    letter = {"mbti_group": "NT", "headline": "헤드라인 X",
              "subtitle": "부제", "body": ["문단1", "문단2"],
              "key_points": ["포인트1"], "closing_line": "마무리"}
    sub = {"email": "a@b.com", "unsubscribe_token": "TOK123"}
    html = render_html(letter, sub, "2026-05-17")
    assert "헤드라인 X" in html
    assert "문단1" in html and "문단2" in html
    assert "포인트1" in html
    assert "token=TOK123" in html          # 수신거부 링크 필수
    assert "수신거부" in html
    s = subject(letter, "2026-05-17")
    assert "민철" in s and "헤드라인 X" in s


def test_render_escapes_html():
    from newsletter.render import render_html
    letter = {"mbti_group": "SF", "headline": "<script>x</script>",
              "subtitle": "", "body": ["<b>bold</b>"], "key_points": []}
    html = render_html(letter, {"unsubscribe_token": "t"}, "2026-05-17")
    assert "<script>x</script>" not in html
    assert "&lt;script&gt;" in html


def test_subscriber_eligibility():
    from newsletter.subscribers import _eligible
    assert _eligible({"email": "a@b.com", "status": "active", "consent": True})
    assert not _eligible({"email": "a@b.com", "status": "active", "consent": False})
    assert not _eligible({"email": "a@b.com", "status": "suppressed", "consent": True})
    assert not _eligible({"email": "", "status": "active", "consent": True})


def test_sender_dry_run_does_not_call_ses():
    os.environ["NEWSLETTER_DRY_RUN"] = "1"
    from newsletter.sender import send
    r = send("a@b.com", "subj", "<html></html>", "https://x/unsub")
    assert r["status"] == "dry_run"
    assert r["to"] == "a@b.com"


def test_handler_syntax_ok():
    path = os.path.join(BACKEND, "handlers", "newsletter.py")
    ast.parse(open(path, encoding="utf-8").read())
