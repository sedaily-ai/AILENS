"""뉴스레터 Phase 1 — 오프라인 단위 테스트 (AWS 미접속).

render / subscribers / sender(dry-run) 의 핵심 계약만 검증.
핸들러 syntax-only 테스트는 제거됨 — handlers/newsletter.py는
handlers/newsletter/(패키지)에 항상 가려져 자기 모듈 경로로 영원히
도달 불가능했고(2026-07-30 폐기된 Lambda), 리팩토링 세션에서 삭제됨.
"""
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
BACKEND = os.path.dirname(HERE)  # service/backend
sys.path.insert(0, BACKEND)


def test_render_html_contains_letter_and_unsubscribe():
    from newsletter.render import render_html, subject

    # 레터는 그룹 구분 없이 모든 구독자에게 동일한 기본 아이덴티티(AI LENS)로 렌더링한다.
    letter = {"id": "l-2026-05-17", "headline": "헤드라인 X",
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
    assert "AI LENS" in s and "헤드라인 X" in s


def test_render_escapes_html():
    from newsletter.render import render_html
    letter = {"id": "l-2026-05-17", "headline": "<script>x</script>",
              "subtitle": "", "body": ["<b>bold</b>"], "key_points": []}
    html = render_html(letter, {"unsubscribe_token": "t"}, "2026-05-17")
    assert "<script>x</script>" not in html
    assert "&lt;script&gt;" in html


def test_sender_dry_run_does_not_call_ses():
    os.environ["NEWSLETTER_DRY_RUN"] = "1"
    from newsletter.sender import send
    r = send("a@b.com", "subj", "<html></html>", "https://x/unsub")
    assert r["status"] == "dry_run"
    assert r["to"] == "a@b.com"
