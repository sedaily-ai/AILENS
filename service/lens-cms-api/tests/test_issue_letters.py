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
        "sources": [{"url": "https://www.sedaily.com/article/1", "axes": ["news"]}],
        "poll": {"kind": "emotion", "question": "소식을 들었을 때 어떠셨나요?", "options": [
            {"key": "send", "label": "신기했어요"}, {"key": "wait", "label": "걱정됐어요"}, {"key": "unsure", "label": "잘 모르겠어요"}]},
    }
    base.update(over)
    return base


def test_validate_normalizes_valid_payload():
    v = _repo().validate_letter_payload(_payload())
    assert v["sections"][0]["paragraphs"][0][1]["href"].startswith("https://")
    assert v["sources"][0]["url"].endswith("/article/1") and v["poll"]["options"][0]["key"] == "send"


@pytest.mark.parametrize("bad", [
    {"slug": "no-date"},
    {"title": ""},
    {"categories": []},
    {"categories": ["economics"]},
    {"categories": ["industry", "industry"]},
    {"sections": [{"axis": "weird", "heading": "h", "key_line": "k", "paragraphs": []}]},
    {"sections": [{"axis": "news", "heading": "h", "key_line": "", "paragraphs": []}]},
    {"sections": [{"axis": "news", "heading": "h", "key_line": "k", "paragraphs": [[{"text": "x", "href": "javascript:1"}]]}]},
    {"sources": [{"article_no": "1", "axes": []}]},  # 기사 번호 직접 지정 불가
    {"sources": [{"axes": []}]},  # 주소 없음
    {"sources": [{"url": "ftp://x", "axes": []}]},
    {"sources": [{"external_url": "https://a.com", "external_title": "t", "external_outlet": "o", "approved_by": "admin", "axes": []}]},  # 외부 매체 불가
    {"sources": [{"url": "https://www.sedaily.com/article/1", "axes": []}, {"url": "https://www.sedaily.com/article/1?ref=x", "axes": []}]},  # 같은 기사 중복
    {"sources": [{"url": "https://www.sedaily.com/article/1", "axes": ["bad"]}]},
    {"poll": {"kind": "emotion", "question": "q", "options": [{"key": "a", "label": "x"}]}},
    {"poll": {"kind": "emotion", "question": "q", "options": [{"key": "A", "label": "x"}, {"key": "b", "label": "y"}]}},
    {"poll": {"kind": "binary", "question": "q", "options": [{"key": "a", "label": "x"}, {"key": "unsure", "label": "y"}]}},
    {"poll": {"kind": "emotion", "question": "지금 보내는 게 맞을까요?", "options": [{"key": "a", "label": "보내야 해요"}, {"key": "unsure", "label": "잘 모르겠어요"}]}},
    {"poll": {"kind": "emotion", "question": "어떠셨나요?", "options": [{"key": "a", "label": "합리적인 선택"}, {"key": "unsure", "label": "잘 모르겠어요"}]}},
    {"poll": {"kind": "emotion", "question": "어떠셨나요?", "options": [{"key": "a", "label": "신기해요"}, {"key": "b", "label": "걱정돼요"}]}},  # 중립 선택지 없음
])
def test_validate_rejects(bad):
    with pytest.raises(_repo().LetterError):
        _repo().validate_letter_payload(_payload(**bad))


def _publishable(**over):
    url = lambda n: f"https://www.sedaily.com/article/{n}"
    seg = lambda n: {"text": f"t{n}", "href": url(n) + "?ref=sedailyEng"}
    letter = {
        "summary": ["s"], "editor_note": "e", "categories": ["industry"],
        "sections": [{"key_line": "k", "paragraphs": [[seg(1), seg(2)]]}, {"key_line": "k", "paragraphs": [[seg(3)]]}, {"key_line": "k", "paragraphs": [["x"]]}],
        "sources": [{"article_no": str(n), "title": f"t{n}", "url": url(n)} for n in (1, 2, 3)],
        "poll": {"kind": "emotion", "question": "어떠셨나요?", "options": [{"key": "a", "label": "신기했어요"}, {"key": "unsure", "label": "잘 모르겠어요"}]},
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


def test_publish_blocks_biased_poll_and_directive_text_in_any_category():
    r = _repo()
    biased = {"kind": "emotion", "question": "지금 사야 할까요?", "options": [{"key": "a", "label": "사야 해요"}, {"key": "unsure", "label": "잘 모르겠어요"}]}
    assert any("중립" in p for p in r.publish_problems(_publishable(poll=biased)))
    assert any("권유·지시" in p for p in r.publish_problems(_publishable(editor_note="지금 매수하세요")))
    # 분류와 상관없이 같은 규칙: 산업·시그널·사회 어디든 통과 조건은 동일
    for cats in (["industry"], ["markets", "national"], ["finance"]):
        assert r.publish_problems(_publishable(categories=cats)) == []


def test_quoted_opinion_in_body_is_not_blocked():
    letter = _publishable()
    letter["sections"][2]["paragraphs"] = [["전문가들은 \"더 늦기 전에 바다로 보내야 한다\"고 말했어요."]]
    assert _repo().publish_problems(letter) == []


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


@pytest.mark.parametrize("note", ["이건 아이러니예요.", "화제성 이슈가 재밌는 경로로 번져요.", "결국 이렇게 됐어요.", "지켜봐야 해요.", "가" * 201])
def test_editor_note_standard_rejects_opinion_and_long(note):
    problems = _repo().publish_problems(_publishable(editor_note=note))
    assert any("에디터 한마디" in p for p in problems)


def test_editor_note_standard_accepts_fact_linking_sentence():
    note = "이 순위는 현지 편집자와 전문가 추천을 바탕으로 정해져요. 같은 기준에서 종로3가는 2021년 3위에서 올해 1위가 됐어요."
    assert _repo().publish_problems(_publishable(editor_note=note)) == []


class _Cur:
    """execute 순서대로 미리 정한 fetchall 결과를 돌려주는 가짜 커서."""
    def __init__(self, *results):
        self.results = list(results)
        self.sql = []
    def execute(self, sql, params=None):
        self.sql.append((" ".join(sql.split()), params))
    def fetchall(self):
        return self.results.pop(0)


def test_source_resolves_to_archive_first_ignoring_query_tag():
    r = _repo()
    cur = _Cur([{"provider": "bigkinds", "external_id": "N1"}])
    got = r._resolve_source(cur, "https://www.sedaily.com/article/20099230?ref=kpf", 0)
    assert got == {"archive_provider": "bigkinds", "archive_id": "N1", "article_no": None}
    assert cur.sql[0][1] == ("https://www.sedaily.com/article/20099230",)  # 꼬리표 제거 후 url_key 와 대조


def test_source_falls_back_to_legacy_articles_then_rejects_unknown():
    r = _repo()
    got = r._resolve_source(_Cur([], [{"article_no": "2KHJR4QOYT"}]), "https://www.sedaily.com/article/20092388", 0)
    assert got["article_no"] == "2KHJR4QOYT" and got["archive_id"] is None
    with pytest.raises(r.LetterError) as e:  # 담지 않은 주소(AI 가 지어냈거나 검색을 거치지 않은 기사)
        r._resolve_source(_Cur([], []), "https://example.com/x", 1)
    assert "후보로 담은" in str(e.value)


def _article(**over):
    base = {"news_id": "N1", "title": "기사", "original_link": "https://www.sedaily.com/article/1?ref=kpf", "published_at": "2026-10-08", "byline": "홍길동", "content": "미리보기"}
    base.update(over)
    return base


def test_save_archives_upserts_bigkinds_article(monkeypatch):
    r = _repo()
    calls = []

    class Cur:
        def execute(self, sql, params=None):
            calls.append((" ".join(sql.split()), params))
        def fetchone(self):
            p = calls[-1][1]
            return {"external_id": p[1], "title": p[3], "source_url": p[7]}

    @contextlib.contextmanager
    def cur():
        yield Cur()

    monkeypatch.setattr(r, "get_cursor", cur)
    out = r.save_archives([_article()])
    assert out == [{"external_id": "N1", "title": "기사", "url": "https://www.sedaily.com/article/1"}]  # 응답 주소는 꼬리표 제거
    sql, params = calls[0]
    assert "ON CONFLICT (provider, external_id) DO UPDATE" in sql
    assert params[0] == "bigkinds" and params[4] == "서울경제" and params[7].endswith("?ref=kpf")  # 원문 링크는 그대로 보관


@pytest.mark.parametrize("bad", [
    [], "x", [_article(news_id="")], [_article(title="")], [_article(original_link="")], [_article(original_link="ftp://x")],
    [_article(published_at="어제")], [_article() for _ in range(31)], ["str"],
])
def test_save_archives_rejects_invalid(bad):
    with pytest.raises(_repo().LetterError):
        _repo().save_archives(bad)
