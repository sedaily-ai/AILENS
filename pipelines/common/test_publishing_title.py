import publishing as pu


def test_parse_letter_title_accepts_same_line_and_next_line_forms():
    same = "[제목] AI 공급업체 하나 멈추면 금융사 여럿이 동시에 흔들린다\n\n[리드] 금융사마다 AI를 들이는데요."
    nxt = "[제목]\nAI 공급업체 하나 멈추면 금융사 여럿이 흔들린다\n\n[리드 3~5문장]\n본문"
    assert pu.parse_letter_title(same) == "AI 공급업체 하나 멈추면 금융사 여럿이 동시에 흔들린다"
    assert pu.parse_letter_title(nxt) == "AI 공급업체 하나 멈추면 금융사 여럿이 흔들린다"
    assert pu.parse_letter_title("[리드] 본문만 있음") is None


def test_compact_prompt_format_is_parsed_lead_summary_and_terms():
    raw = ("[제목] 제목 한 줄이에요 테스트 제목입니다 정말로\n\n[리드] 금융사마다 AI를 들이고 있어요. 공급업체가 적다면 어떨까요.\n\n"
           "◾ 📋 현황: 질문형 소제목인가요?\n\n본문 문단이에요.\n\n-- 자료: 서울경제신문(2026년 10월 11일), 기사\n\n"
           "[핵심 요약]\n\n서울경제에 따르면 첫 문장입니다. 둘째 문장입니다. 셋째 문장입니다.\n\n아래로 스크롤해 더 자세히 살펴보세요 📖\n[용어] 집중위험 | 소수에 몰린 의존이 위험을 키우는 것")
    paras = pu.parse_letters(raw)
    assert paras[0].startswith("금융사마다 AI를") and paras[1].startswith("◾ 📋")
    assert pu.parse_letter_summary_bullets(raw) == ["서울경제에 따르면 첫 문장입니다.", "둘째 문장입니다.", "셋째 문장입니다."]
    assert pu.parse_letter_terms(raw) == [{"term": "집중위험", "explain": "소수에 몰린 의존이 위험을 키우는 것"}]


def test_source_line_with_double_dash_is_not_published_as_body():
    raw = "[리드] 리드예요 정말로 리드입니다.\n\n◾ 🗳️ 투표: 질문인가요?\n① 가 ② 나 ③ 다\n\n-- 자료: 서울경제신문(2026년 10월 11일), 기사\n\n[핵심 요약]\n\n요약입니다."
    paras = pu.parse_letters(raw)
    assert all("자료:" not in p for p in paras) and paras[-1].startswith("① 가")
