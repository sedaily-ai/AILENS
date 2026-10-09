"""이슈 레터(v1.37) 저장소의 검증 규칙을 DB 없이 확인한다(test_v136_repos.py 와 같은 방식: 가짜 db 모듈).

실제 제약(FK·CHECK·UNIQUE)은 DDL 적용 때 로컬 Postgres 16 으로 따로 확인했다(v1.37 변경 이력 참조).
"""
import contextlib
import sys
import types
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

SQL: list = []
STATE: dict = {}


class FakeCursor:
    def execute(self, sql, params=None):
        SQL.append((" ".join(sql.split()), params))
        STATE["last"] = " ".join(sql.split())

    def fetchone(self):
        last = STATE["last"]
        if "FROM issue_letters l JOIN issue_letter_polls" in last:
            return {"id": 7}
        if "FROM issue_letter_poll_options WHERE letter_id=%s AND key=%s" in last:
            return {"?column?": 1} if STATE.get("option_ok", True) else None
        if "ON CONFLICT (letter_id, voter_hash) DO NOTHING" in last:
            return {"option_key": "send"} if STATE.get("fresh", True) else None
        if "SELECT option_key FROM issue_letter_votes" in last:
            return {"option_key": "send"}
        return None

    def fetchall(self):
        if "FROM issue_letter_poll_options o LEFT JOIN" in STATE["last"]:
            return [{"key": "send", "n": 3}, {"key": "wait", "n": 1}]
        return []


@contextlib.contextmanager
def _fake_get_cursor():
    yield FakeCursor()


@pytest.fixture(autouse=True)
def stub_db(monkeypatch):
    SQL.clear()
    STATE.clear()
    module = types.ModuleType("db")
    module.get_cursor = _fake_get_cursor
    monkeypatch.setitem(sys.modules, "db", module)
    monkeypatch.delitem(sys.modules, "issue_letters_repo", raising=False)
    monkeypatch.setenv("VOTE_HASH_SALT", "test-salt")


def _repo():
    import issue_letters_repo as r
    return r


def _payload(**over):
    base = {
        "slug": "2026-10-09-테스트", "title": "제목", "deck": "요약", "summary": ["한 줄"], "editor_note": "한마디",
        "categories": ["industry"],
        "sections": [{"axis": "news", "heading": "h", "key_line": "k", "paragraphs": [["문장 ", {"text": "링크", "href": "https://www.sedaily.com/article/1?ref=x"}]]}],
        "sources": [{"article_no": "1", "axes": ["news"]}],
        "poll": {"kind": "binary", "question": "q", "options": [{"key": "send", "label": "a"}, {"key": "wait", "label": "b"}]},
    }
    base.update(over)
    return base


def test_validate_normalizes_valid_payload():
    v = _repo().validate_letter_payload(_payload())
    assert v["sections"][0]["paragraphs"][0][1]["href"].startswith("https://")
    assert v["sources"][0]["article_no"] == "1" and v["poll"]["options"][0]["key"] == "send"


@pytest.mark.parametrize("bad", [
    {"slug": "no-date"},
    {"title": ""},
    {"categories": []},
    {"sections": [{"axis": "weird", "heading": "h", "key_line": "k", "paragraphs": []}]},
    {"sections": [{"axis": "news", "heading": "h", "key_line": "", "paragraphs": []}]},
    {"sections": [{"axis": "news", "heading": "h", "key_line": "k", "paragraphs": [[{"text": "x", "href": "javascript:1"}]]}]},
    {"sources": [{"article_no": "1", "external_url": "https://a.com", "axes": []}]},
    {"sources": [{"external_url": "https://a.com", "external_title": "t", "external_outlet": "o", "axes": []}]},  # 승인자 없음
    {"sources": [{"article_no": "1", "axes": ["bad"]}]},
    {"sources": [{"article_no": "1", "axes": []}, {"article_no": "1", "axes": []}]},
    {"poll": {"kind": "binary", "question": "q", "options": [{"key": "a", "label": "x"}]}},
    {"poll": {"kind": "binary", "question": "q", "options": [{"key": "A", "label": "x"}, {"key": "b", "label": "y"}]}},
])
def test_validate_rejects(bad):
    with pytest.raises(_repo().LetterError):
        _repo().validate_letter_payload(_payload(**bad))


def _publishable(**over):
    url = lambda n: f"https://www.sedaily.com/article/{n}"
    seg = lambda n: {"text": f"t{n}", "href": url(n) + "?ref=sedailyEng"}
    letter = {
        "summary": ["s"], "editor_note": "e", "category_names": ["산업"],
        "sections": [{"key_line": "k", "paragraphs": [[seg(1), seg(2)]]}, {"key_line": "k", "paragraphs": [[seg(3)]]}, {"key_line": "k", "paragraphs": [["x"]]}],
        "sources": [{"article_no": str(n), "title": f"t{n}", "url": url(n)} for n in (1, 2, 3)],
        "poll": {"kind": "binary"},
    }
    letter.update(over)
    return letter


def test_publish_ok_when_rules_met():
    assert _repo().publish_problems(_publishable()) == []


def test_publish_requires_three_distinct_own_inline_links():
    letter = _publishable()
    letter["sections"][0]["paragraphs"] = [[letter["sections"][0]["paragraphs"][0][0]]]  # 링크 1개로 줄임
    letter["sections"][1]["paragraphs"] = [["링크 없음"]]
    assert any("3개 이상" in p for p in _repo().publish_problems(letter))


def test_publish_rejects_inline_link_not_in_sources_and_placeholder():
    letter = _publishable()
    letter["sections"][2]["paragraphs"] = [[{"text": "x", "href": "https://www.sedaily.com/article/999"}]]
    letter["sources"].append({"article_no": "5", "title": "(예시) 가짜", "url": "https://www.sedaily.com/article/5"})
    problems = _repo().publish_problems(letter)
    assert any("쓰인 기사' 목록에 없습니다" in p for p in problems)
    assert any("자리표시" in p for p in problems)


def test_publish_blocks_non_emotion_poll_for_finance():
    assert any("감정 반응형" in p for p in _repo().publish_problems(_publishable(category_names=["금융"])))
    assert _repo().publish_problems(_publishable(category_names=["금융"], poll={"kind": "emotion"})) == []


def test_publish_requires_admin_and_blocks_self_approval(monkeypatch):
    r = _repo()
    with pytest.raises(r.LetterError) as e:
        r.publish(1, "e1", "editor")
    assert e.value.status == 403
    monkeypatch.setattr(r, "get_admin", lambda _id: {"status": "in_review", "author_no": "a1"})
    with pytest.raises(r.LetterError) as e:
        r.publish(1, "a1", "admin")
    assert e.value.status == 403 and "본인" in str(e.value)
    monkeypatch.setattr(r, "get_admin", lambda _id: {"status": "draft", "author_no": "a1"})
    with pytest.raises(r.LetterError) as e:
        r.publish(1, "b2", "admin")
    assert e.value.status == 409


def test_voter_hash_is_stable_salted_and_hides_raw():
    r = _repo()
    h = r.voter_hash("user-1")
    assert h == r.voter_hash("user-1") and len(h) == 64 and "user-1" not in h
    assert h != r.voter_hash("user-1", salt="other")
    with pytest.raises(r.LetterError):
        r.voter_hash("")
    with pytest.raises(r.LetterError):
        r.voter_hash("x", salt="")


def test_vote_fresh_then_duplicate(monkeypatch):
    r = _repo()
    result, fresh = r.vote("slug", "anon-1", "send")
    assert fresh and result["counts"] == {"send": 3, "wait": 1} and result["my_choice"] == "send"
    inserted = [p for s, p in SQL if s.startswith("INSERT INTO issue_letter_votes")][0]
    assert "anon-1" not in inserted[1] and len(inserted[1]) == 64  # 원문이 아니라 해시만 저장
    STATE["fresh"] = False
    _, fresh = r.vote("slug", "anon-1", "send")
    assert not fresh


def test_vote_rejects_unknown_option():
    STATE["option_ok"] = False
    with pytest.raises(_repo().LetterError):
        _repo().vote("slug", "anon-1", "nope")
