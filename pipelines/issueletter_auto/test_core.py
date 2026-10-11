import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent))
import core


def A(key, title="기사", content=""):
    return {"key": key, "title": title, "content": content}


ARTS = {k: A(k, f"제목{k}") for k in "12345678"}


def test_clean_clusters_drops_invented_used_small_and_sensitive():
    raw = [
        {"topic": "정상", "keys": ["1", "2", "3", "99"]},          # 99 는 없는 번호 → 버리고 3건
        {"topic": "작음", "keys": ["4", "5"]},                      # 2건 → 제외
        {"topic": "재사용", "keys": ["6", "7", "8"]},               # 6 은 이미 사용 → 제외
        "not a dict", {"topic": "x"}, {"topic": "", "keys": ["1", "2", "3"]},
    ]
    out = core.clean_clusters(raw, ARTS, used_keys=["6"])
    assert [c["topic"] for c in out] == ["정상"] and out[0]["keys"] == ["1", "2", "3"]


def test_clean_clusters_excludes_sensitive_topics():
    arts = {k: A(k, "야당이 선거 앞두고" if k == "1" else "경제 소식") for k in "123"}
    assert core.clean_clusters([{"topic": "경제", "keys": ["1", "2", "3"]}], arts) == []
    assert core.is_sensitive("대통령실 발표") and not core.is_sensitive("금리 동결")
    assert core.is_sensitive("임은정 광주중수청장 감찰 지시") and core.is_sensitive("검찰 인사 논란")
    assert not core.is_sensitive("삼성전자 3분기 실적") and not core.is_sensitive("대구 마트 천장 붕괴 부상")


def test_clean_clusters_sorts_by_size_and_caps():
    raw = [{"topic": "셋", "keys": ["1", "2", "3"]}, {"topic": "여덟", "keys": list("12345678")}]
    out = core.clean_clusters(raw, ARTS)
    assert [c["topic"] for c in out] == ["여덟", "셋"] and len(out[0]["keys"]) == core.MAX_CLUSTER


def test_restrict_to_cluster_rejects_outside_and_external():
    draft = {"sections": [{"paragraphs": [["a ", {"text": "x", "href": core.sedaily_url("1")}, " b ", {"text": "y", "href": core.sedaily_url("9")}]]}],
             "sources": [{"url": core.sedaily_url("2")}, {"url": "https://example.com/a"}]}
    bad = core.restrict_to_cluster(draft, ["1", "2", "3"])
    assert core.sedaily_url("9") in bad and "https://example.com/a" in bad and core.sedaily_url("1") not in bad


def test_unsupported_numbers_catches_invented_figures():
    draft = {"title": "매출 265억 원", "deck": "", "summary": [], "editor_note": "", "sections": [{"heading": "h", "key_line": "3배", "paragraphs": [["2024년 176억 원에서 999억 원으로"]]}]}
    sources = ["인도법인 매출은 2024년 176억 원, 지난해 265억 원이다."]
    assert core.unsupported_numbers(draft, sources) == ["999"]  # '3배'는 한 자리라 대조하지 않는다


def test_pick_editors_by_overlap_and_none():
    editors = [{"slug": "a", "topic_names": ["금리", "환율"]}, {"slug": "b", "topic_names": ["금리"]}, {"slug": "c", "topic_names": ["반도체"]}]
    assert core.pick_editors(["금리", "환율"], editors) == ["a", "b"]
    assert core.pick_editors(["한옥"], editors) == []  # 겹침 없음 → 보류 신호


def test_advice_hits_and_prefix_strip():
    d = {"title": "t", "deck": "", "summary": ["분할 매수로 대응"], "editor_note": "", "sections": [{"heading": "h", "key_line": "**핵심:** 좋아요", "paragraphs": [["평범한 문장"]]}]}
    assert set(core.advice_hits(d)) >= {"분할", "매수"}
    assert core.strip_key_line_prefix(d)["sections"][0]["key_line"] == "좋아요"
    assert core.strip_key_line_prefix({"sections": [{"key_line": "핵심：이미 없음 아님"}]})["sections"][0]["key_line"] == "이미 없음 아님"
    assert core.advice_hits({"title": "금리 동결", "deck": "", "summary": [], "editor_note": "", "sections": []}) == []


def test_market_reporting_terms_are_not_flagged_but_advice_is():
    ok = {"title": "외국인 8거래일 연속 순매도", "deck": "개인이 순매수했고 매도 물량을 흡수할 수급 주체가 부족해요", "summary": [], "editor_note": "", "sections": []}
    assert core.advice_hits(ok) == []
    bad = {"title": "t", "deck": "", "summary": ["지금 분할 매수가 필요해요"], "editor_note": "", "sections": []}
    assert "매수" in core.advice_hits(bad) and "분할" in core.advice_hits(bad)
    assert "매도" in core.advice_hits({**ok, "deck": "지금 매도하세요"})
