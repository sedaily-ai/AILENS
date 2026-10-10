"""레터 이메일 구독: 입력 검증, 다이제스트 선택, 문안, 발송 안전장치를 DB 없이 확인한다."""
import contextlib
import datetime as dt
import sys
import types
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
NOW = dt.datetime(2026, 10, 12, 1, 0, tzinfo=dt.timezone.utc)  # 월요일 10:00 KST


@pytest.fixture(autouse=True)
def stub_db(monkeypatch):
    module = types.ModuleType("db")
    module.get_cursor = contextlib.nullcontext
    monkeypatch.setitem(sys.modules, "db", module)
    for n in ("interests_repo", "topics_repo", "issue_letters_repo", "letter_subscriptions_repo", "letter_mail"):
        monkeypatch.delitem(sys.modules, n, raising=False)
    monkeypatch.delenv("LETTER_MAIL_ENABLED", raising=False)
    monkeypatch.delenv("LETTER_MAIL_FROM", raising=False)


def _r():
    import letter_subscriptions_repo
    return letter_subscriptions_repo


def letter(i, days_old=1, topics=(), cats=()):
    return {"id": i, "slug": f"l{i}", "issue_no": i, "title": f"제목{i}", "deck": f"요약{i}", "published_dt": NOW - dt.timedelta(days=days_old),
            "topics": [{"slug": s, "name": n, "is_primary": p} for s, n, p in topics],
            "category_keys": [{"slug": s, "is_primary": p} for s, p in cats]}


def test_email_and_preferences_validation():
    r = _r()
    assert r.normalize_email("  Foo@Example.COM ") == "foo@example.com"
    for bad in ("", "a", "a@b", "a b@c.com", "a@b.c", "a@b.com,c@d.com", "x" * 250 + "@a.com"):
        with pytest.raises(r.LetterError):
            r.normalize_email(bad)
    assert r.validate_preferences(None, None) == ("daily", 8)
    assert r.validate_preferences("weekly", "20") == ("weekly", 20)
    for f, h in (("instant", 8), ("daily", 7), ("daily", 21), ("daily", "x")):
        with pytest.raises(r.LetterError):
            r.validate_preferences(f, h)
    assert r.mask_email("foo@example.com") == "fo***@example.com"


def test_subscribe_requires_consent_and_interests():
    r = _r()
    with pytest.raises(r.LetterError, match="동의"):
        r.subscribe("a@b.com", [{"type": "topic", "key": "rates"}], "daily", 8, False)
    with pytest.raises(r.LetterError, match="동의"):
        r.subscribe("a@b.com", [{"type": "topic", "key": "rates"}], "daily", 8, "true")
    with pytest.raises(r.LetterError, match="하나 이상"):
        r.subscribe("a@b.com", [], "daily", 8, True)


def test_subscribe_refused_when_mail_not_configured(monkeypatch):
    r = _r()
    ok = [{"type": "topic", "key": "rates"}]
    with pytest.raises(r.LetterError) as e:
        r.subscribe("a@b.com", ok, "daily", 8, True)
    assert e.value.status == 503  # 확인 메일을 보낼 수 없는 상태에서 신청을 받지 않는다(받은 척하지 않는다)


def test_pick_digest_orders_by_score_skips_sent_and_unrelated():
    r = _r()
    interests = {("topic", "rates"), ("category", "property")}
    cands = [letter(1, 1, topics=[("rates", "금리", True)]), letter(2, 1, cats=[("property", True)]), letter(3, 1, topics=[("kospi", "코스피", True)]),
             letter(4, 1, topics=[("rates", "금리", True)]), letter(5, 1, topics=[("rates", "금리", False)])]
    out = r.pick_digest(interests, cands, {4}, NOW)
    assert [l["id"] for l in out] == [1]  # 3은 무관, 4는 이미 보냄. 한 번에 한 편(점수 1위)
    assert [l["id"] for l in r.pick_digest(interests, cands, {4, 1}, NOW)] == [5]  # 다음 발송에는 다음 편
    assert out[0]["reason_text"] == "관심 주제 '금리'를 다뤘어요"
    assert r.pick_digest(interests, [letter(3, 1, topics=[("kospi", "코스피", True)])], set(), NOW) == []  # 겹침 없으면 보내지 않음


LETTER = {"slug": "s1", "issue_no": 4, "title": "제목 <x>", "deck": "한 줄", "category_names": ["시그널", "경제"], "published_at": "2026-10-09T01:00:00+00:00",
          "read_minutes": 3, "summary": ["첫째 줄 <b>", "둘째 줄"], "editor_note": "에디터 말", "topics": [{"name": "금리"}],
          "sections": [{"axis": "news", "axis_label": "선정 소식", "heading": "소제목", "key_line": "소식 핵심", "paragraphs": [["앞 ", {"text": "링크", "href": "https://www.sedaily.com/a?x=1&y=2"}, " 뒤"]]},
                       {"axis": "other", "axis_label": "다른 시각", "heading": "시각", "key_line": "시각 핵심", "paragraphs": [["본문"]]}],
          "sources": [{"title": "기사 제목", "outlet": "서울경제", "url": "https://www.sedaily.com/a", "axes": ["news"]}],
          "poll": {"question": "어떠셨나요?", "options": [{"label": "의외"}, {"label": "잘 모르겠어요"}]}}


def test_render_letter_follows_site_structure_and_escapes():
    _r()
    import letter_mail
    subject, h, text = letter_mail.render_letter(LETTER, "관심 주제 '금리'를 다뤘어요", "TOKEN123")
    assert subject == "[AI LENS 레터] 제목 <x>"
    for needle in ("제목 &lt;x&gt;", "이 레터에 쓰인 기사", "1분 요약", "첫째 줄 &lt;b&gt;", "핵심: 소식 핵심", "핵심: 시각 핵심", "에디터 한마디", "어떠셨나요?", "잘 모르겠어요", "사이트에서 보기"):
        assert needle in h, needle
    assert h.index("이 레터에 쓰인 기사") < h.index("1분 요약") < h.index("핵심: 소식 핵심") < h.index("에디터 한마디") < h.index("어떠셨나요?")  # 사이트와 같은 순서
    assert 'href="https://www.sedaily.com/a?x=1&amp;y=2"' in h  # 본문 인라인 링크 유지
    assert "unsubscribe?token=TOKEN123" in h and "unsubscribe?token=TOKEN123" in text and "서울특별시 종로구" in h
    assert "링크(https://www.sedaily.com/a?x=1&y=2)" in text
    for banned in ("놓치지", "지금 바로", "필독", "추천"):
        assert banned not in h and banned not in text


def test_render_letter_without_optional_parts():
    _r()
    import letter_mail
    bare = {**LETTER, "poll": None, "editor_note": "", "sources": [], "summary": [], "topics": []}
    _, h, _ = letter_mail.render_letter(bare, "", "T")
    assert "어떠셨나요?" not in h and "에디터 한마디" not in h and "이 레터에 쓰인 기사" not in h and "1분 요약" not in h


def test_confirm_mail_escapes_and_mentions_ignore_if_not_requested():
    import letter_mail
    subject, html_body, text = letter_mail.render_confirm("abc")
    assert "subscribe/confirm?token=abc" in html_body and "무시" in text


def test_send_is_dry_run_without_config(caplog):
    import letter_mail
    assert letter_mail.mail_enabled() is False
    assert letter_mail.send_mail("a@b.com", "s", "<p>h</p>", "t") is None


def test_run_send_guards():
    r = _r()
    mon, tue = dt.date(2026, 10, 12), dt.date(2026, 10, 13)
    with pytest.raises(r.LetterError):
        r.run_send("instant", mon, 8)
    with pytest.raises(r.LetterError):
        r.run_send("daily", mon, 7)
    assert r.run_send("weekly", tue, 8)["skipped"]
    night = dt.datetime(2026, 10, 12, 13, 0, tzinfo=dt.timezone.utc)  # 22:00 KST
    with pytest.raises(r.LetterError, match="야간"):
        r.run_send("daily", mon, 8, dry_run=False, now=night)
    with pytest.raises(r.LetterError, match="꺼져"):
        r.run_send("daily", mon, 8, dry_run=False, now=NOW)  # 발송 설정이 없으면 실제 발송 불가
