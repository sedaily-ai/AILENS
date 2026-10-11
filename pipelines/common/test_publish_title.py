import publish_utils as pu


def test_parse_letter_title_accepts_same_line_and_next_line_forms():
    same = "[제목] AI 공급업체 하나 멈추면 금융사 여럿이 동시에 흔들린다\n\n[리드] 금융사마다 AI를 들이는데요."
    nxt = "[제목]\nAI 공급업체 하나 멈추면 금융사 여럿이 흔들린다\n\n[리드 3~5문장]\n본문"
    assert pu.parse_letter_title(same) == "AI 공급업체 하나 멈추면 금융사 여럿이 동시에 흔들린다"
    assert pu.parse_letter_title(nxt) == "AI 공급업체 하나 멈추면 금융사 여럿이 흔들린다"
    assert pu.parse_letter_title("[리드] 본문만 있음") is None
