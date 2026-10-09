#!/usr/bin/env python3
"""이슈 레터 샘플 입력 — 목업 샘플(docs/product/모아쓰기레터/seed/issue_letters_seed.json)을 관리 API로 넣는다.

서버(EC2, root)에서 lens-cms-api(127.0.0.1:8000)를 직접 호출한다. 관리 토큰은 PM2 환경에서 읽으며 출력하지 않는다.
  python3 seed_issue_letters.py seed.json                     # 드라이런: 어떤 기사가 연결되고 무엇이 막히는지만 보여 준다
  python3 seed_issue_letters.py seed.json --apply             # 초안으로 입력
  python3 seed_issue_letters.py seed.json --apply --publish --admin-no <편집장 사번>   # 발행 규칙을 통과한 것만 발행

규칙
  - 자사 기사 출처는 기사 DB(articles)에서 제목으로 찾아 article_no 로 연결한다. 못 찾으면(예: AI LENS 기사 페이지) 건너뛰고 알린다.
  - 발행은 서버의 발행 규칙(본문 인라인 자사 기사 링크 3개 이상 등)을 통과한 레터만 한다. 통과하지 못하면 초안으로 남긴다.
  - 같은 slug 가 이미 있으면 건너뛴다(재실행 안전).
"""
import argparse
import json
import os
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request

BASE = os.environ.get("LENS_API", "http://127.0.0.1:8000")


def _token():
    t = os.environ.get("ADMIN_INTERNAL_TOKEN")
    if t:
        return t
    out = subprocess.run(["pm2", "jlist"], capture_output=True, text=True, check=True).stdout
    return json.loads(out)[0]["pm2_env"]["ADMIN_INTERNAL_TOKEN"]


TOKEN = None


def call(method, path, body=None):
    req = urllib.request.Request(BASE + path, method=method, data=None if body is None else json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json", "X-Internal-Token": TOKEN})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        try:
            detail = json.loads(e.read()).get("detail")
        except Exception:
            detail = ""
        return e.code, {"detail": detail}


def norm(u):
    return urllib.parse.urlsplit(u)._replace(query="", fragment="").geturl().rstrip("/")


def resolve(src):
    """제목으로 기사 DB 를 검색해 URL 이 일치하는 기사의 article_no 를 돌려준다."""
    want = norm(src["url"])
    if "sedaily.com/article/" not in want:
        return None
    code, res = call("GET", "/admin/issue-letters/candidates?" + urllib.parse.urlencode({"q": src["title"][:40], "limit": 20}))
    if code != 200:
        return None
    for a in res.get("articles", []):
        if norm(a["url"]) == want:
            return a["article_no"]
    return None


def main():
    global TOKEN
    ap = argparse.ArgumentParser()
    ap.add_argument("seed")
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--publish", action="store_true")
    ap.add_argument("--admin-no", default="")
    args = ap.parse_args()
    if args.publish and not args.admin_no:
        sys.exit("--publish 는 --admin-no(편집장 사번)가 필요합니다")
    TOKEN = _token()
    letters = json.load(open(args.seed, encoding="utf-8"))
    code, existing = call("GET", "/admin/issue-letters?limit=200")
    have = {l["slug"] for l in existing.get("letters", [])} if code == 200 else set()

    for l in letters:
        print(f"\n== {l['slug']}")
        if l["slug"] in have:
            print("  이미 있음 — 건너뜀")
            continue
        sources, skipped = [], []
        for s in l["sources"]:
            no = resolve(s)
            if no:
                sources.append({"article_no": no, "axes": s["axes"]})
                print(f"  연결  {s['title'][:40]}  → {no}")
            else:
                skipped.append(s["title"])
                print(f"  건너뜀(기사 DB에 없음)  {s['title'][:40]}")
        data = {k: l[k] for k in ("slug", "title", "deck", "summary", "editor_note", "read_minutes", "categories", "sections", "poll")}
        data["sources"] = sources
        if not args.apply:
            continue
        code, res = call("POST", "/admin/issue-letters", {"data": data, "actor": {}})
        if code != 200:
            print(f"  입력 실패 {code}: {res.get('detail')}")
            continue
        lid = res["letter"]["id"]
        code, res = call("GET", f"/admin/issue-letters/{lid}")
        problems = res.get("publish_problems", [])
        print(f"  초안 입력 완료 (id {lid}), 발행 전 문제 {len(problems)}건")
        for p in problems:
            print("   -", p)
        if args.publish and not problems:
            call("POST", f"/admin/issue-letters/{lid}/submit")
            code, res = call("POST", f"/admin/issue-letters/{lid}/publish", {"actor": {"employee_no": args.admin_no, "role": "admin"}})
            print("  발행" if code == 200 else f"  발행 실패 {code}: {res.get('detail')}")
        elif args.publish:
            print("  → 규칙을 통과하지 못해 초안으로 남깁니다")


if __name__ == "__main__":
    main()
