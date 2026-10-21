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


def test_prune_topics_and_attribution():
    d = {"title": "t", "deck": "", "summary": ["AI 도입이 늘었어요"], "editor_note": "", "topics": ["인공지능", "은행", "가상자산"],
         "sections": [{"axis": "other", "heading": "h", "key_line": "k", "paragraphs": [["은행 관계자는 \"지켜보겠다\"고 말했어요."], ["근거 없는 단정이에요."]]}]}
    out = core.prune_topics(d)
    assert d["topics"] == ["인공지능", "은행"] and out["dropped"] == ["가상자산"]
    assert "근거 없는 단정" in core.other_attribution_problem(d)
    d["sections"][0]["paragraphs"].pop()
    assert core.other_attribution_problem(d) == ""


def test_keyword_clusters_use_word_pairs_and_skip_generic_and_sensitive():
    def art(i, title, day, cat="산업"):
        return {"key": str(i), "title": title, "date": f"2026-10-{day:02d}", "content_len": 2500, "top_category": cat, "paper_number": "5"}
    arts = [art(1, "삼성전자 영업익 107조 돌파", 8), art(2, "삼성전자 영업익 두고 전망 엇갈려", 9), art(3, "[단독] 삼성전자 영업익 비결은", 10),
            art(4, "여당 국정감사 공방", 8), art(5, "여당 국정감사 공방 이어져", 9), art(6, "여당 국정감사 또 충돌", 10)]
    out = core.keyword_clusters(arts, min_chars=5000)
    assert out and "삼성전자" in out[0]["keyword"] and "영업익" in out[0]["keyword"]
    assert all("국정감사" not in c["keyword"] for c in out)


def test_repair_json_quotes_fixes_unescaped_inner_quotes():
    import json
    bad = '{\n  "heading": "정부 "투기 아니면 처분 없다"…특별법",\n  "paragraphs": [["장관은 ", {"text": ""농지 후속 조치"", "href": "https://x/1"}, " 라고 했어요"]],\n  "sources": [{ "title": "금융연구원 "집중위험 관리"", "url": "https://x/2" }]\n}'
    fixed = json.loads(core.repair_json_quotes(bad))
    assert fixed["heading"].startswith('정부 "투기') and fixed["paragraphs"][0][1]["text"] == '"농지 후속 조치"'


def test_sanitize_draft_removes_article_id_notes_but_keeps_links():
    d = {"title": "t", "summary": ["a (기사 20099278 근거) b"], "editor_note": "e",
         "sections": [{"heading": "h", "key_line": "k", "paragraphs": [["문장 (기사 20099278 근거)", {"text": "링크", "href": "https://www.sedaily.com/article/20099278"}],
                                                                      [{"block": "callout", "text": "아르텍스는 도구예요. (기사 20099278 근거)"}]]}]}
    core.sanitize_draft(d)
    assert "20099278" not in d["summary"][0] and "20099278" not in d["sections"][0]["paragraphs"][0][0]
    assert d["sections"][0]["paragraphs"][0][1]["href"].endswith("20099278") and "20099278" not in d["sections"][0]["paragraphs"][1][0]["text"]


def test_drop_advice_removes_sentences_and_blocks_without_regeneration():
    d = {"sections": [{"paragraphs": [["실적이 늘었어요. 분할 매수가 유효하다고 했어요. 순매도 규모가 컸어요."], [{"block": "callout", "text": "지금이 투자 기회예요."}]]}]}
    n = core.drop_advice(d)
    txt = core.draft_body_text({"sections": d["sections"], "title": "", "deck": "", "summary": [], "editor_note": ""})
    assert n == 2 and "분할" not in txt and "투자 기회" not in txt and "순매도" in txt and "실적이 늘었어요" in txt


def test_drop_unsupported_removes_sentences_with_numbers_not_in_sources():
    d = {"sections": [{"paragraphs": [["매출은 176억 원이에요. 합산하면 10574억 원이에요."]]}]}
    assert core.drop_unsupported(d, ["매출은 176억 원"]) == 1
    assert "10574" not in core.para_text(d["sections"][0]["paragraphs"][0]) and "176억" in core.para_text(d["sections"][0]["paragraphs"][0])


def test_drop_flagged_removes_matching_sentence_and_reports_unmatched():
    d = {"sections": [{"paragraphs": [["수도권 외 점포 매출은 150% 늘었어요. 부산은 별도로 집계됐어요."], [{"block": "callout", "text": "지방 점포가 가장 많이 늘었어요."}]]}]}
    left = core.drop_flagged(d, ["수도권 외 점포 매출은 150% 늘었어요. — 기사와 다름", "본문에 없는 문장입니다 정말로 없어요 — 이유"])
    assert len(left) == 1 and "150%" not in core.para_text(d["sections"][0]["paragraphs"][0]) and "부산은" in core.para_text(d["sections"][0]["paragraphs"][0])


def test_keyword_clusters_drop_numeric_and_all_generic_pairs():
    def art(i, title, day, cat="산업"):
        return {"key": str(i), "title": title, "date": f"2026-10-{day:02d}", "content_len": 2500, "top_category": cat, "paper_number": "5"}
    arts = [art(i, f"기업{i} 매출 1조 돌파", 8 + i % 3) for i in range(1, 6)]  # 서로 무관한 기업들이 '1조+매출'만 공유
    assert all("1조" not in c["keyword"] for c in core.keyword_clusters(arts, min_chars=5000))


def test_sanitize_keeps_spaces_around_link_segments():
    d = {"title": "t", "summary": [], "editor_note": "e", "sections": [{"heading": "h", "key_line": "k", "paragraphs": [["기록했다고 ", {"text": "링크", "href": "https://x/1"}, " 8일 공시했어요."]]}]}
    core.sanitize_draft(d)
    assert d["sections"][0]["paragraphs"][0][0] == "기록했다고 " and d["sections"][0]["paragraphs"][0][2] == " 8일 공시했어요."


def test_fit_blocks_truncates_labels_and_drops_overlong_text_blocks():
    long_label = "가" * 40
    d = {"sections": [{"paragraphs": [
        [{"block": "versus", "left": {"label": long_label, "text": "a"}, "right": {"label": "b", "text": "b"}}],
        [{"block": "callout", "text": "나" * 500}],
        [{"block": "timeline", "items": [{"label": "d%d" % i, "text": "t"} for i in range(10)]}]]}]}
    changed = core.fit_blocks(d)
    paras = d["sections"][0]["paragraphs"]
    assert changed == 3 and len(paras) == 2
    assert len(paras[0][0]["left"]["label"]) == 30 and len(paras[1][0]["items"]) == 8


def test_trim_to_max_removes_longest_plain_paragraphs_but_keeps_links_and_one_per_section():
    d = {"sections": [{"paragraphs": [["가" * 1500], ["나" * 1400], [{"text": "링크", "href": "https://x/1"}, "다" * 800]]}, {"paragraphs": [["라" * 200]]}]}
    removed = core.trim_to_max(d)
    assert removed >= 1 and core.body_chars(d) <= core.BODY_MAX_CHARS
    assert len(d["sections"][1]["paragraphs"]) == 1 and any(isinstance(x, dict) for p in d["sections"][0]["paragraphs"] for x in p)


def test_bad_header_fields_and_matching_for_rewrite():
    d = {"title": "t 11.8GW 규모", "deck": "정상 문장이에요", "editor_note": "e", "summary": ["a 176억 원", "b"], "sections": [{"heading": "h", "key_line": "엔비디아는 올해 8월 말 실적을 발표했어요", "paragraphs": []}]}
    bad = core.bad_header_fields(d, ["매출은 176억 원"])
    assert set(bad) == {"title"} and core.set_header_field(d, "title", "고친 제목") is None and d["title"] == "고친 제목"
    hit = core.match_header_fields(d, ["엔비디아는 올해 8월 말 실적을 발표했어요 — 시점이 기사와 다름"])
    assert list(hit) == ["key_line:0"]


def test_editor_covered_uses_topic_names_and_aliases():
    editors = [{"slug": "jihoon", "topic_names": ["인공지능", "반도체"]}]
    ai = {"articles": [{"title": "AI 반도체 수요", "content": ""}]}       # 별칭(AI)으로 겹침
    bio = {"articles": [{"title": "국산 비만약 출시", "content": "한미약품 신약"}]}
    assert core.editor_covered(ai, editors) is True
    assert core.editor_covered(bio, editors) is False
    assert core.editor_covered(ai, []) is False


def test_article_date_text_and_dates_are_not_invented_numbers():
    assert core.article_date_text({"date": "20261016"}) == "게재일 2026년 10월 16일"
    assert core.article_date_text({"date": "2026-10-09"}) == "게재일 2026년 10월 9일"
    assert core.article_date_text({"date": ""}) == ""
    draft = {"sections": [{"paragraphs": [[{"block": "timeline", "items": [{"label": "2026년 9월 29일", "text": "항소법원 판결"}]}]]}]}
    sources = ["지난달 29일 항소법원이 판결했다."]
    assert "2026" in core.unsupported_numbers(draft, sources)  # 게재일이 없으면 연도는 지어낸 숫자로 잡힌다
    assert core.unsupported_numbers(draft, sources + [core.article_date_text({"date": "20261016"})]) == []


def test_keyword_clusters_penalize_topics_of_recent_letters():
    def art(i, title, day):
        return {"key": str(i), "title": title, "date": f"2026-10-{day:02d}", "content_len": 2500, "paper_number": "5"}
    arts = [art(1, "오픈AI 보안모델 공개", 8), art(2, "오픈AI 보안모델 확대", 9), art(3, "오픈AI 보안모델 논의", 10), art(4, "오픈AI 보안모델 출시", 10),
            art(5, "라네즈 인도법인 성장", 8), art(6, "라네즈 인도법인 확장", 9), art(7, "라네즈 인도법인 매출", 10)]
    assert "오픈AI" in core.keyword_clusters(arts)[0]["keyword"]  # 감점이 없으면 기사가 많은 AI 소재가 1위
    out = core.keyword_clusters(arts, recent_topics=["인공지능"])  # 최근 레터가 인공지능이면('AI' 별칭) 감점
    assert "라네즈" in out[0]["keyword"] and any(c["recent_repeat"] == ["인공지능"] for c in out)


def test_recent_letter_topics_takes_latest_published_only():
    letters = [{"status": "published", "published_at": "2026-10-17", "topics": [{"name": "반도체"}, {"name": "인공지능"}]},
               {"status": "draft", "published_at": None, "topics": ["유럽"]},
               {"status": "published", "published_at": "2026-10-09", "topics": ["종로3가"]},
               {"status": "published", "published_at": "2026-10-16", "topics": ["인공지능", "미국"]}]
    assert core.recent_letter_topics(letters, n=2) == ["반도체", "인공지능", "미국"]
