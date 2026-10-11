"""기사 제목으로 폴백된 1기사 레터(4가지 시선 번들)의 제목을 레터형 제목으로 다시 만든다.
기본은 드라이런(목록과 새 제목만 출력·저장). --apply 를 주면 headline 과 레터·팟캐스트·영상 탭의 question 을 갱신한다(웹툰 탭의 질문은 그대로).
대상: 기간 안의 발행 글 중 headline 이 원문 기사 제목과 같은 것. 정치 분류는 기사 제목을 유지하므로 건너뛴다.

사용: AWS_PROFILE=... python3 scripts/retitle_posts.py --from 2026-10-09 [--limit 80] [--apply]
"""
import argparse
import json
import re
import sys
from datetime import datetime, timedelta
from pathlib import Path

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT / "common"))
sys.path.insert(0, str(ROOT / "issueletter_auto"))
import headline as H  # noqa: E402
import run as R  # noqa: E402  (관리자 API 호출 api() 재사용)
import discovery_loader  # noqa: E402

KEEP_QUESTION_LABELS = ("레터", "팟캐스트", "영상")  # 웹툰은 자체 질문(core_question)이라 건드리지 않는다


def article_key(url: str) -> str:
    m = re.search(r"/article/(\d+)", url or "")
    return m.group(1) if m else ""


def apply_plan(path, categories, do_apply):
    plan = json.loads(Path(path).read_text(encoding="utf-8"))
    ok = [x for x in plan if x["new"] and (not categories or x["category"] in categories)]
    skipped = [x for x in plan if x["new"] and x not in ok]
    Path("/tmp/retitle_skipped.json").write_text(json.dumps(skipped, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"적용 대상 {len(ok)}건, 제외 {len(skipped)}건(/tmp/retitle_skipped.json)")
    if not do_apply:
        return
    done = 0
    for x in ok:
        c, full = R.api("GET", f"/admin/posts/{x['id']}?channel=lens")
        if c != 200:
            print("조회 실패", x["id"], c)
            continue
        bi = full["post"]["body_inline"]
        for l in bi.get("lenses", []):
            if l.get("label") in KEEP_QUESTION_LABELS and (l.get("question") or "").strip() == x["old"].strip():
                l["question"] = x["new"]
        c, _ = R.api("PUT", f"/admin/posts/{x['id']}", {"headline": x["new"], "channels": ["lens"], "body_inline": bi})
        done += 1 if c == 200 else 0
        if c != 200:
            print("실패", x["id"], c)
    print(f"갱신 {done}/{len(ok)}건")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--from", dest="start", default="2026-10-09")
    ap.add_argument("--limit", type=int, default=80)
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--from-plan", help="이미 만든 계획 파일(/tmp/retitle_plan.json)을 그대로 적용(재생성 없음, 비용 0)")
    ap.add_argument("--categories", default="", help="적용할 분류(쉼표). 비우면 전부")
    a = ap.parse_args()
    if a.from_plan:
        return apply_plan(a.from_plan, [c for c in a.categories.split(",") if c], a.apply)
    days = (datetime.now() - datetime.strptime(a.start, "%Y-%m-%d")).days + 2
    titles = {x["key"]: x for x in discovery_loader.fetch_recent(days)}
    plan, used = [], {}
    d = datetime.strptime(a.start, "%Y-%m-%d")
    while d.date() <= datetime.now().date() and len(plan) < a.limit:
        code, res = R.api("GET", f"/admin/posts?status=published&date={d:%Y-%m-%d}&limit=200")
        for p in (res.get("posts") if code == 200 else []) or []:
            if not p.get("is_lens_bundle"):
                continue
            art = titles.get(article_key(p.get("source_url")))
            if not art or (p.get("headline") or "").strip() != (art["title"] or "").strip():
                continue  # 이미 레터형 제목이거나 원문을 못 찾음
            c2, full = R.api("GET", f"/admin/posts/{p['id']}?channel=lens")
            post = full.get("post") if c2 == 200 else None
            if not post:
                continue
            bi = post.get("body_inline") or {}
            category = bi.get("category") or ""
            lens_letter = next((l for l in bi.get("lenses", []) if l.get("label") == "레터"), {})
            body = "\n".join(lens_letter.get("paragraphs") or [])
            if not body:
                continue
            picked = H.generate(art["title"], art.get("sub_title") or "", body, category, used)
            plan.append({"id": p["id"], "date": f"{d:%Y-%m-%d}", "category": category, "old": p["headline"], "new": picked["title"] if picked else None,
                         "type": picked["type"] if picked else None})
            if picked:
                used[picked["type"]] = used.get(picked["type"], 0) + 1
            if len(plan) >= a.limit:
                break
        d += timedelta(days=1)
    Path("/tmp/retitle_plan.json").write_text(json.dumps(plan, ensure_ascii=False, indent=1), encoding="utf-8")
    ok = [x for x in plan if x["new"]]
    print(f"대상 {len(plan)}건 중 새 제목 {len(ok)}건 (정치·통과 후보 없음 {len(plan) - len(ok)}건은 기사 제목 유지)  → /tmp/retitle_plan.json")
    for x in ok[:40]:
        print(f"- [{x['category']}] {x['old'][:40]}\n    → {x['new']}")
    if not a.apply:
        return
    done = 0
    for x in ok:
        c, full = R.api("GET", f"/admin/posts/{x['id']}?channel=lens")
        post = full["post"]
        bi = post["body_inline"]
        for l in bi.get("lenses", []):
            if l.get("label") in KEEP_QUESTION_LABELS and (l.get("question") or "").strip() == x["old"].strip():
                l["question"] = x["new"]
        c, _ = R.api("PUT", f"/admin/posts/{x['id']}", {"headline": x["new"], "channels": ["lens"], "body_inline": bi})
        done += 1 if c == 200 else 0
        if c != 200:
            print("실패", x["id"], c)
    print(f"갱신 {done}/{len(ok)}건")


if __name__ == "__main__":
    main()
