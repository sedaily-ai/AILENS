"""심판 — 이진 게이트(조작에 강함) + 블라인드 페어와이즈 랭킹(인간 선호 상관 높음).
mbti-eval-opus-47. 리서치 반영: 길이 편향 명시 통제, CoT 후 평결, 위치 스왑은 호출부에서."""
import json, re
from common import converse, JUDGE_ARN, cluster_facts, PERSONAS

def _json(txt):
    m = re.search(r"\{.*\}", txt, re.S)
    return json.loads(m.group(0)) if m else {"_parse_error": txt[:300]}

GATE_SYS = """너는 한국 경제 뉴스레터 'AI LENS'의 발행 적격성 심사관이다.
입력은 원문 기사들과, 그 기사들로 작성된 한 페르소나의 발행본이다.
오직 객관 사실만 이진(pass/fail)으로 판정한다. 문체 호불호로 판정하지 마라.

판정 3항:
- fact: 원문의 수치·인용구·고유명사를 왜곡/오기했으면 fail, 아니면 pass
- persona_boundary: 해당 페르소나(%s) 렌즈를 벗어나 다른 유형 영역을 본문 주조로 침범했으면 fail
- hallucination: 원문에 없는 사실·인물·수치·발언을 창작했으면 fail (footer의 다른 페르소나 한 줄은 원문 사실 범위 내면 허용)

먼저 각 항목 근거를 본문에서 짧게 인용해 사고하고, 그다음 JSON만 출력:
{"reasoning":"...","fact":"pass|fail","persona_boundary":"pass|fail","hallucination":"pass|fail","verdict":"PASS|FAIL"}
하나라도 fail 이면 verdict=FAIL."""

RANK_SYS = """너는 'AI LENS' 발행본 비교 심사관이다.
같은 원문·같은 페르소나로 작성된 두 발행본 A, B를 비교해 어느 쪽이 더 나은지 고른다.

평가 4축(동등 가중): 신선도(새 시각), 깊이(원문만으로 안 보이는 통찰), 내러티브(읽는 맛·구성), 페르소나차별(그 페르소나만의 결).

엄격 통제:
- 길이로 판단하지 마라. 더 길다/짧다는 것 자체는 장단점이 아니다. 같은 분량이라 가정하고 밀도로 보라.
- A/B 제시 순서로 판단하지 마라.
- 원문 사실 왜곡이 있으면 그 본문을 감점하라.

먼저 4축별로 A·B를 짧게 비교 사고하고, 그다음 JSON만 출력:
{"reasoning":"...","per_axis":{"신선도":"A|B|tie","깊이":"A|B|tie","내러티브":"A|B|tie","페르소나차별":"A|B|tie"},"winner":"A|B|tie"}"""


def gate(cluster, letter_text, persona):
    sys = GATE_SYS % PERSONAS[persona]
    user = f"[원문 기사]\n{cluster_facts(cluster)}\n\n[발행본]\n{letter_text}"
    txt, ti, to = converse(JUDGE_ARN, sys, user, max_tokens=1500)
    r = _json(txt); r["_tok"] = ti + to
    return r


def rank_once(cluster, persona, text_A, text_B):
    user = (f"[원문 기사]\n{cluster_facts(cluster)}\n\n"
            f"[발행본 A]\n{text_A}\n\n[발행본 B]\n{text_B}")
    txt, ti, to = converse(JUDGE_ARN, RANK_SYS, user, max_tokens=1200)
    r = _json(txt); r["_tok"] = ti + to
    return r


def rank_pair(cluster, persona, text_v1, text_v2, id1, id2):
    """위치 스왑 2회. 일관 승자만 인정, 불일치는 tie(uncertain)."""
    a = rank_once(cluster, persona, text_v1, text_v2)   # A=v1 B=v2
    b = rank_once(cluster, persona, text_v2, text_v1)    # A=v2 B=v1 (스왑)
    map_a = {"A": id1, "B": id2, "tie": "tie"}
    map_b = {"A": id2, "B": id1, "tie": "tie"}
    w_a = map_a.get(a.get("winner"), "tie")
    w_b = map_b.get(b.get("winner"), "tie")
    if w_a == w_b and w_a != "tie":
        consensus, consistent = w_a, True
    elif "tie" in (w_a, w_b) and {w_a, w_b} != {"tie"}:
        consensus, consistent = (w_a if w_b == "tie" else w_b), False
    else:
        consensus, consistent = "tie", (w_a == w_b)
    return {"order1": a, "order2_swapped": b, "winner": consensus,
            "position_consistent": consistent, "_tok": a["_tok"] + b["_tok"]}
