"""독자 관심(interests_repo): 입력 검증, 해시 네임스페이스, 점수·이유 계산을 DB 없이 확인한다."""
import contextlib
import datetime as dt
import sys
import types
from pathlib import Path

import pytest

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
NOW = dt.datetime(2026, 10, 10, tzinfo=dt.timezone.utc)


@pytest.fixture(autouse=True)
def stub_db(monkeypatch):
    module = types.ModuleType("db")
    module.get_cursor = contextlib.nullcontext
    monkeypatch.setitem(sys.modules, "db", module)
    for n in ("interests_repo", "topics_repo", "issue_letters_repo"):
        monkeypatch.delitem(sys.modules, n, raising=False)


def _m():
    import interests_repo
    return interests_repo


def letter(days_old=1, topics=(), cats=()):
    return {"published_dt": NOW - dt.timedelta(days=days_old),
            "topics": [{"slug": s, "name": n, "is_primary": p} for s, n, p in topics],
            "category_keys": [{"slug": s, "is_primary": p} for s, p in cats]}


def test_reader_hash_is_namespaced_and_not_equal_to_vote_hash():
    m = _m()
    import issue_letters_repo as r
    h = m.reader_hash("device-1", salt="s")
    assert len(h) == 64 and h == m.reader_hash("device-1", salt="s") and h != m.reader_hash("device-2", salt="s")
    assert h != r.voter_hash("device-1", salt="s")  # 같은 기기 값이어도 투표 해시와 이어지지 않는다
    for bad in ("", "x" * 129):
        with pytest.raises(m.LetterError):
            m.reader_hash(bad, salt="s")
    with pytest.raises(m.LetterError):
        m.reader_hash("device-1", salt="")


def test_validate_interest_items():
    m = _m()
    out = m.validate_interest_items([{"type": "topic", "key": "rates"}, {"type": "category", "key": "finance"}, {"type": "topic", "key": " rates "}])
    assert out == [("topic", "rates"), ("category", "finance")]  # 중복 제거·공백 정리
    assert m.validate_interest_items([]) == []
    for bad in ("x", [1], [{"type": "tag", "key": "a"}], [{"type": "topic"}], [{"type": "topic", "key": ""}], [{"type": "category", "key": "sports"}],
                [{"type": "topic", "key": "k" * 65}], [{"type": "topic", "key": f"t{i}"} for i in range(41)]):
        with pytest.raises(m.LetterError):
            m.validate_interest_items(bad)


def test_score_topic_overlap_beats_category_and_reasons_are_names():
    m = _m()
    interests = {("topic", "rates"), ("topic", "samsung"), ("category", "property")}
    a = letter(1, topics=[("samsung", "삼성전자", True), ("rates", "금리", False)], cats=[("markets", True)])
    score, reasons = m.score_letter(interests, a, NOW)
    assert reasons == ["삼성전자", "금리"]  # 주 주제 먼저
    assert 6.5 < score < 7.0  # (3+1)+3 = 7 에 1일 감쇠
    b = letter(1, cats=[("property", True)])
    assert m.score_letter(interests, b, NOW)[0] < score
    assert m.score_letter(interests, b, NOW)[1] == ["부동산"]  # 주제가 없으면 분류 이름
    assert m.score_letter(interests, letter(1, topics=[("fx", "환율", True)], cats=[("economy", True)]), NOW) == (0.0, [])


def test_score_recency_decay_halves_every_30_days():
    m = _m()
    interests = {("topic", "rates")}
    fresh = m.score_letter(interests, letter(0, topics=[("rates", "금리", True)]), NOW)[0]
    old = m.score_letter(interests, letter(30, topics=[("rates", "금리", True)]), NOW)[0]
    assert abs(old - fresh / 2) < 0.01


def test_reason_limited_to_three_and_text_is_factual():
    m = _m()
    interests = {("topic", s) for s in "abcd"}
    l = letter(1, topics=[(s, s.upper(), False) for s in "abcd"])
    assert len(m.score_letter(interests, l, NOW)[1]) == 3
    assert m.reason_text(["금리", "삼성전자"], True) == "관심 주제 '금리'·'삼성전자'를 다뤘어요"
    assert m.reason_text(["부동산"], False) == "관심 분야 '부동산'의 레터예요"


def test_bundle_seed_is_consistent_with_dictionary():
    import json
    base = Path(__file__).resolve().parents[3] / "docs/product/모아쓰기레터/seed"
    topics = {t["slug"] for t in json.load(open(base / "topics_seed.json", encoding="utf-8"))}
    bundles = json.load(open(base / "interest_bundles_seed.json", encoding="utf-8"))
    m = _m()
    assert len(bundles) >= 8 and len({b["slug"] for b in bundles}) == len(bundles)
    for b in bundles:
        pairs = m.validate_interest_items(b["items"])
        assert pairs and all(k in topics for t, k in pairs if t == "topic"), b["slug"]
