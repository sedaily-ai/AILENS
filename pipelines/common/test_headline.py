import headline as h


def test_problems_flags_known_failure_patterns():
    body = "신청 대상이 75개사로 늘었어요"
    assert h.problems("신청 대상 75개사로 늘고, 집중위험도 함께 커지다 🕸️", body) == []
    assert "뻔한 아이콘" in h.problems("금융사 75개가 몰린 AI 공급업체, 한 곳 장애가 전체를 흔드는 구조 🔒", body)
    assert any("마침표" in x for x in h.problems("신청 대상 75개사로 늘었다고요. 🕸️", body))
    assert any("본문에 없는 숫자" in x for x in h.problems("신청 대상 90개사로 늘고, 집중위험도 함께 커지다 🕸️", body))
    assert "이모지는 끝에 하나만" in h.problems("신청 대상 🕸️ 75개사로 늘고, 집중위험도 함께 커지다 🧵", body)


def test_pick_skips_candidates_that_break_rules():
    body = "토스 페이스페이 최대 2만 원 할인"
    c = [{"type": "반문형", "title": "토스 페이스페이로 결제하면 3만 원 할인이라고요? 🪪"},  # 본문에 없는 숫자
         {"type": "발견설명형", "title": "토스 페이스페이, 신촌 현대백화점 최대 2만 원 할인 조건이 따로 있대요 🪪"}]
    assert h.pick(c, body, "현대百서 얼굴로 결제하면 반값…토스 페이스페이 첫선")["type"] == "발견설명형"
    assert h.pick([c[0]], body, "") is None
