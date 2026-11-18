"""PRISM 자동 장면 JSON → 다큐(인포그래픽) 화면 틀 장면 계획 변환 (2026-11-18).

PRISM 일괄 제작이 만든 장면 JSON(cuts[].type/data/caption/style)을 DocHorizontal·DocVertical이 읽는
plan(장면 목록)으로 바꾼다. 대본·음성·컷 길이는 그대로 두고 화면만 바꾼다(컷 수 = 장면 수).
숫자는 장면 JSON의 data 값만 쓴다(지어내지 않음). 새 틀에 같은 장면이 없는 유형은 가장 가까운 장면으로 대체한다.

  python3 doc_plan.py scene.json plan-h.json [--vertical]
  python3 doc_plan.py scene.json plan-v.json --shorts   # 쇼츠 대본(plan-v.script.json)과 세로 계획
"""
from __future__ import annotations

import json
import sys


# 마무리 화면 — 기존 PRISM 마무리 화면과 같은 AI 제작 고지를 넣는다(빼지 않는다).
END_LINES = ["AI PRISM · Seoul Economic Daily", "This episode was produced with AI assistance", "based on Seoul Economic Daily reporting."]

# 쇼츠 길이 목표. 컷 길이는 음성 합성 뒤에야 알 수 있어 낭독 속도(초당 단어 수)로 어림한다.
SHORTS_MAX_SEC = 50.0
WORDS_PER_SEC = 2.6
_DATA_TYPES = ("stat", "compare", "donut", "rank", "chart")
SHORTS_CUT_MAX_SEC = 6.5  # 이보다 긴 숫자 컷은 쇼츠에서 뺀다(화면이 오래 멈춰 보임)
# 쇼츠 마무리 음성 — 롱폼 아웃트로(약 13초)를 그대로 읽으면 정지 화면이 길다. AI 제작 고지는 화면 글자(END_LINES)로 유지.
SHORTS_OUTRO = "That's today's AI PRISM. Watch the full episode on our channel."


def _num(v: float) -> str:
    """21.5 → "21.5", 8.0 → "8", 12600 → "12,600"."""
    if float(v).is_integer():
        return f"{int(v):,}"
    return f"{v:,.2f}".rstrip("0").rstrip(".")


def _big(value: float, unit: str | None) -> tuple[str, str | None]:
    """숫자와 단위를 큰 글자/작은 단위로 나눈다. %·x·배처럼 짧은 단위는 숫자에 붙인다."""
    u = (unit or "").strip()
    if u in ("%", "x", "X", "배", "$", "₩") or len(u) <= 1:
        return (u + _num(value)) if u in ("$", "₩") else (_num(value) + u), None
    return _num(value), u


def _parts(cut: dict) -> list[dict]:
    cap = cut.get("caption")
    if isinstance(cap, str):
        return [{"text": cap}]
    return [p for p in (cap or []) if str(p.get("text", "")).strip()]


def _statement(cut: dict) -> dict:
    parts = _parts(cut)
    lines = [p["text"].strip() for p in parts] or [(cut.get("narration") or "")[:40]]
    accent = next((i for i, p in enumerate(parts) if p.get("emphasis")), None)
    s: dict = {"kind": "statement", "lines": lines[:3]}
    if accent is not None and accent < 3:
        s["accent"] = accent
    return s


def _kicker(cut: dict) -> str | None:
    k = (cut.get("style") or {}).get("kicker")
    return k if isinstance(k, str) and k.strip() else None


def scene_for(cut: dict, vertical: bool = False) -> dict:
    t = cut.get("type")
    d = cut.get("data") or {}
    st = cut.get("style") or {}

    if t == "stat" and "value" in d:
        big, unit = _big(d["value"], d.get("unit"))
        s = {"kind": "number", "kicker": _kicker(cut) or d.get("label"), "big": big, "sub": st.get("sub") or d.get("label")}
        if unit:
            s["unit"] = unit
        if s["kicker"] == s["sub"]:
            s.pop("kicker")
        return s

    if t == "donut" and "value" in d:
        return {"kind": "number", "kicker": _kicker(cut), "big": _num(d["value"]) + "%", "sub": d.get("label")}

    if t == "compare" and "before" in d and "after" in d:
        b, a = d["before"], d["after"]
        def lab(v: dict) -> str:
            big, unit = _big(v["value"], v.get("unit"))
            return big + (" " + unit if unit else "")
        bl, al = lab(b), lab(a)
        k = _kicker(cut)
        if vertical:
            return {"kind": "compare", "top": {"label": bl, "sub": b.get("label", "")}, "bottom": {"label": al, "sub": a.get("label", "")}}
        return {"kind": "contrast", "left": {"label": bl, "sub": (k + " · " if k else "") + b.get("label", "")},
                "right": {"label": al, "sub": (k + " · " if k else "") + a.get("label", "")}}

    if t in ("rank", "chart"):
        items = d.get("items") or d.get("points") or []
        unit = (d.get("unit") or "").strip()
        if vertical or not items:
            def val(v: float) -> str:
                big, u = _big(v, unit)
                return big + (" " + u if u else "")
            return {"kind": "list", "kicker": _kicker(cut), "items": [{"label": f"{x['label']} {val(x['value'])}"} for x in items[:5]]}
        mx = max(x["value"] for x in items)
        # unit은 꼭 넘긴다 — 빠지면 막대 장면이 증가율(+정수%)로 표시한다(2.5조 원 → "+3%" 오표시, 2026-11-18).
        return {"kind": "bars", "kicker": _kicker(cut) or d.get("sourceNote"), "items": [{"label": x["label"], "value": x["value"]} for x in items[:5]],
                "reveal": len(items[:5]), "max": mx * 1.15 if mx > 0 else 1, "unit": unit, "prefix": ""}

    if t == "diagram":
        nodes = [n for n in d.get("nodes", []) if n.get("kind") == "node"]
        if nodes:
            if vertical:
                return {"kind": "list", "kicker": _kicker(cut), "items": [{"label": n.get("label", ""), "sub": n.get("sub")} for n in nodes[:4]]}
            return {"kind": "flow", "kicker": _kicker(cut), "nodes": [{"label": n.get("label", ""), "sub": n.get("sub") or ""} for n in nodes[:4]]}

    if t == "highlight":
        cards = st.get("cards") or []
        if len(cards) >= 2:
            if vertical:
                return {"kind": "list", "kicker": _kicker(cut), "items": [{"label": c.get("label", ""), "sub": c.get("sub")} for c in cards[:4]]}
            if len(cards) == 2:
                return {"kind": "pair", "kicker": _kicker(cut) or " ".join(p["text"].strip() for p in _parts(cut)),
                        "items": [{"label": c.get("label", ""), "sub": c.get("sub") or ""} for c in cards]}
            return {"kind": "list", "kicker": _kicker(cut), "items": [{"label": c.get("label", ""), "sub": c.get("sub")} for c in cards[:4]]}
        if st.get("scene") == "ticker" and st.get("ticker"):
            return {"kind": "list", "kicker": _kicker(cut) or "Key numbers", "items": [{"label": x} for x in st["ticker"][:4]]}
        return _statement(cut)

    if t == "closing":
        return {"kind": "end", "lines": END_LINES}

    return _statement(cut)


def _clean(s: dict) -> dict:
    """None 값은 빼고, 목록 항목의 None sub도 뺀다(화면 틀이 빈 글자를 그리지 않게)."""
    out = {k: v for k, v in s.items() if v is not None}
    for key in ("items", "nodes"):
        if key in out:
            out[key] = [{k: v for k, v in it.items() if v is not None} for it in out[key]]
    return out


def build_plan(script: dict, vertical: bool = False) -> list[dict]:
    plan = [_clean(scene_for(c, vertical)) for c in script.get("cuts", [])]
    if vertical and plan and plan[0]["kind"] in ("number", "statement"):
        plan[0]["instant"] = True  # 쇼츠 첫 프레임 = 표지(첫 장면이 0프레임부터 완성돼 보이게)
    return plan


def _est_sec(cut: dict) -> float:
    return len((cut.get("narration") or "").split()) / WORDS_PER_SEC + 0.5


def shorts_cut_indices(script: dict) -> list[int]:
    """쇼츠에 쓸 컷 번호. 도입 훅(날짜 컷 앞) → 본문 숫자 컷(앞에서부터) → 마무리 컷 순서로, 어림 50초 안에서 고른다.
    날짜 컷이 없으면 앞 3컷을 훅으로 본다. 숫자는 장면 JSON 값 그대로라 롱폼과 어긋나지 않는다."""
    cuts = script.get("cuts", [])
    date_i = next((i for i, c in enumerate(cuts) if (c.get("style") or {}).get("scene") == "date"), None)
    hook = list(range(date_i if date_i is not None else min(3, len(cuts))))
    closing = [i for i, c in enumerate(cuts) if c.get("type") == "closing"][-1:]
    picked = [i for i in hook if i not in closing]
    total = sum(_est_sec(cuts[i]) for i in picked) + (_est_sec({"narration": SHORTS_OUTRO}) if closing else 0)
    hook_vals = {json.dumps((cuts[i].get("data") or {}).get("value")) for i in picked}
    for i, c in enumerate(cuts):
        if i in picked or i in closing or c.get("type") not in _DATA_TYPES:
            continue
        if json.dumps((c.get("data") or {}).get("value")) in hook_vals and "value" in (c.get("data") or {}):
            continue  # 훅에서 이미 말한 숫자는 건너뜀
        if _est_sec(c) > SHORTS_CUT_MAX_SEC:
            continue
        if total + _est_sec(c) > SHORTS_MAX_SEC:
            break
        picked.append(i)
        total += _est_sec(c)
    return sorted(picked) + closing


def build_shorts(script: dict) -> tuple[dict, list[dict]]:
    """쇼츠용 대본(고른 컷만)과 세로 장면 계획."""
    idx = shorts_cut_indices(script)
    cuts = [dict(script["cuts"][i]) for i in idx]
    for c in cuts:
        if c.get("type") == "closing":
            c["narration"] = SHORTS_OUTRO
            c["audioFile"] = None  # 혹시 롱폼 음성이 붙어 있으면 새로 합성하게
            c.pop("audioFile")
    short = {**script, "cuts": cuts}
    return short, build_plan(short, vertical=True)


if __name__ == "__main__":
    src, dst = sys.argv[1], sys.argv[2]
    data = json.load(open(src))
    if "--shorts" in sys.argv:
        short, plan = build_shorts(data)
        json.dump(short, open(dst.replace(".json", ".script.json"), "w"), ensure_ascii=False, indent=1)
        print("shorts cuts", shorts_cut_indices(data))
    else:
        plan = build_plan(data, vertical="--vertical" in sys.argv)
    json.dump(plan, open(dst, "w"), ensure_ascii=False, indent=1)
    for i, s in enumerate(plan):
        print(i, s["kind"], json.dumps({k: v for k, v in s.items() if k != "kind"}, ensure_ascii=False)[:120])
