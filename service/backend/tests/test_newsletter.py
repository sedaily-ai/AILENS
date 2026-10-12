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



def test_canonical_article_links_and_no_schedule_promise():
    from newsletter.render import render_html
    path = "/industry/2026/10/12/2026-10-12-%EC%84%B8%EB%9D%BC%EC%A0%AC"
    html = render_html({"headline": "기사", "body": ["실제 요약"], "article_path": path},
                       {"unsubscribe_token": "test"}, "2026-10-12")
    assert html.count(path + "?utm_source=newsletter") == 2
    assert "실제 요약" in html
    assert "/letters/view?id=2026" not in html
    assert "매일 아침" not in html


def test_article_links_reject_external_or_unsafe_paths():
    from newsletter.render import render_html
    for path in ["https://evil.example/x", "//evil.example/x", "/industry/2026/10/12/x\" onclick=\"bad", "/industry/2026/10/12/x?redirect=evil", "/industry/2026/10/12/x\n"]:
        html = render_html({"headline": "기사", "article_path": path}, {}, "2026-10-12")
        assert "evil" not in html and "onclick" not in html
        assert "/letters/view?id=2026-10-12" not in html


def test_legacy_letter_id_is_encoded():
    from newsletter.render import _letter_url
    assert "id=old%26id%3D1" in _letter_url("old&id=1", "2026-10-12")


def test_sender_uses_ses_simple_and_keeps_unsubscribe(monkeypatch):
    import boto3
    from botocore.stub import Stubber
    from newsletter import sender
    client = boto3.client("sesv2", region_name="us-east-1", aws_access_key_id="test", aws_secret_access_key="test")
    captured = {}
    original = client.send_email
    def record(**kwargs):
        captured.update(kwargs)
        return original(**kwargs)
    monkeypatch.setenv("NEWSLETTER_DRY_RUN", "0")
    monkeypatch.setattr(boto3, "client", lambda *a, **k: client)
    monkeypatch.setattr(client, "send_email", record)
    with Stubber(client) as stub:
        stub.add_response("send_email", {"MessageId": "stub-message"})
        result = sender.send("audit@example.com", "제목", "<p>요약</p>", "https://example.com/unsubscribe?token=test")
        stub.assert_no_pending_responses()
    assert result["status"] == "sent"
    assert "Raw" not in captured["Content"]
    message = captured["Content"]["Simple"]
    assert message["Body"]["Html"]["Data"] == "<p>요약</p>"
    assert message["Subject"]["Charset"] == "UTF-8"
    assert message["Headers"] == [{"Name": "List-Unsubscribe", "Value": "<https://example.com/unsubscribe?token=test>"}]


def test_sender_reports_ses_failure(monkeypatch):
    import boto3
    from botocore.stub import Stubber
    from newsletter import sender
    client = boto3.client("sesv2", region_name="us-east-1", aws_access_key_id="test", aws_secret_access_key="test")
    monkeypatch.setenv("NEWSLETTER_DRY_RUN", "0")
    monkeypatch.setattr(boto3, "client", lambda *a, **k: client)
    with Stubber(client) as stub:
        stub.add_client_error("send_email", service_error_code="AccessDeniedException")
        result = sender.send("audit@example.com", "제목", "<p>요약</p>", "https://example.com/unsub")
    assert result["status"] == "error"
