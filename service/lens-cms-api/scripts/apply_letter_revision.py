#!/usr/bin/env python3
"""이미 있는 이슈 레터(초안·검수 중)를 시드 파일의 수정본으로 바꾸고, 규칙을 통과하면 발행한다 — 서버에서 실행(관리자 화면 없이).

흐름: ① 레터가 쓰는 서울경제 기사를 빅카인즈(사이트 타임머신 공개 API)에서 찾아 확인 → ② 후보로 보관(external_archives) → ③ 레터 내용 교체 → ④ 발행 전 점검
      → ⑤ (--publish) 검수 요청과 발행. 서버의 관리 토큰은 PM2 환경에서 읽으며 출력하지 않는다.

  python3 apply_letter_revision.py <seed.json> <slug>                 # 드라이런: 기사를 찾아 확인만 한다(저장 없음)
  python3 apply_letter_revision.py <seed.json> <slug> --apply          # 보관 + 레터 교체 + 점검 결과 출력
  python3 apply_letter_revision.py <seed.json> <slug> --apply --publish  # 점검을 통과하면 검수 요청·발행까지

규칙: 기사는 빅카인즈 검색 결과의 원문 링크에 기사 번호가 일치할 때만 보관한다(못 찾으면 중단). 발행된 레터는 수정할 수 없다.
"""
import argparse
import datetime
import json
import os
import re
import subprocess
import sys
import urllib.error
import urllib.parse
import urllib.request

LOCAL = os.environ.get("LENS_API", "http://127.0.0.1:8000")
TIME_MACHINE = os.environ.get("TIME_MACHINE_URL", "https://chzwwtjtgk.execute-api.us-east-1.amazonaws.com/dev/time-machine")
TOKEN = None


def _token():
    t = os.environ.get("ADMIN_INTERNAL_TOKEN")
    if t:
        return t
    out = subprocess.run(["pm2", "jlist"], capture_output=True, text=True, check=True).stdout
    return json.loads(out)[0]["pm2_env"]["ADMIN_INTERNAL_TOKEN"]


def api(method, path, body=None):
    req = urllib.request.Request(LOCAL + path, method=method, data=None if body is None else json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json", "X-Internal-Token": TOKEN})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, {"detail": json.loads(e.read()).get("detail")}
        except Exception:
            return e.code, {"detail": ""}


def article_number(url):
    m = re.search(r"/article/(\d+)", url)
    return m.group(1) if m else None


def search_candidates(title):
    """제목의 앞부분으로 최근 기사를 검색한다(공개 타임머신 API, 한 번에 최대 20건)."""
    clean = re.sub(r"\s*\[[^\]]*\]\s*$", "", title)
    today = datetime.date.today()
    for q in (clean[:38], " ".join(clean.split()[:4])[:38]):
        qs = urllib.parse.urlencode({"q": q, "from": (today - datetime.timedelta(days=700)).isoformat(), "to": today.isoformat(), "size": 20, "sort": "relevance"})
        with urllib.request.urlopen(f"{TIME_MACHINE}?{qs}", timeout=30) as r:
            articles = json.loads(r.read()).get("articles", [])
        yield q, articles


def find_record(source, search=search_candidates):
    """원문 링크의 기사 번호가 일치하는 빅카인즈 기사 한 건을 찾는다. 없으면 None."""
    want = article_number(source["url"])
    for q, articles in search(source["title"]):
        for a in articles:
            if want and a.get("original_link") and article_number(a["original_link"]) == want:
                return a
    return None


def main():
    global TOKEN
    ap = argparse.ArgumentParser()
    ap.add_argument("seed")
    ap.add_argument("slug")
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--publish", action="store_true")
    args = ap.parse_args()
    TOKEN = _token()
    letter = next((l for l in json.load(open(args.seed, encoding="utf-8")) if l["slug"] == args.slug), None)
    if not letter:
        sys.exit(f"시드에 {args.slug} 가 없습니다")

    print(f"== {args.slug}: 출처 기사 {len(letter['sources'])}건 확인")
    records = []
    for s in letter["sources"]:
        rec = find_record(s)
        if not rec:
            sys.exit(f"  못 찾음: {s['title'][:40]} ({s['url']}) — 중단합니다. 빅카인즈에 없는 기사는 출처로 쓸 수 없습니다")
        print(f"  확인  {rec['published_at']}  {rec['title'][:44]}  ({article_number(rec['original_link'])})")
        records.append(rec)
    if not args.apply:
        print("\n드라이런 끝 — 저장하지 않았습니다. --apply 로 보관·교체합니다.")
        return

    code, res = api("POST", "/admin/issue-letters/archives", {"articles": records})
    if code != 200:
        sys.exit(f"보관 실패 {code}: {res.get('detail')}")
    print(f"\n보관 완료 {len(res['archived'])}건")

    code, res = api("GET", "/admin/issue-letters?limit=200")
    cur = next((l for l in res.get("letters", []) if l["slug"] == args.slug), None) if code == 200 else None
    data = {k: letter[k] for k in ("slug", "title", "deck", "summary", "editor_note", "read_minutes", "categories", "sections", "poll")}
    data["sources"] = [{"url": s["url"], "axes": s["axes"]} for s in letter["sources"]]
    if cur is None:
        code, res = api("POST", "/admin/issue-letters", {"data": data, "actor": {}})
        action = "새로 입력"
    else:
        if cur["status"] not in ("draft", "in_review"):
            sys.exit(f"이미 {cur['status']} 상태라 수정할 수 없습니다")
        code, res = api("PUT", f"/admin/issue-letters/{cur['id']}", {"data": data, "actor": {}})
        action = f"id {cur['id']} 교체"
    if code != 200:
        sys.exit(f"레터 저장 실패 {code}: {res.get('detail')}")
    lid = res["letter"]["id"]
    status = res["letter"]["status"]
    print(f"레터 {action} 완료 (상태 {status})")

    code, res = api("GET", f"/admin/issue-letters/{lid}")
    problems = res.get("publish_problems", [])
    print(f"발행 전 점검: {'모두 통과' if not problems else str(len(problems)) + '건 문제'}")
    for p in problems:
        print("  -", p)
    if not args.publish:
        return
    if problems:
        print("→ 규칙을 통과하지 못해 발행하지 않습니다")
        return
    if status == "draft":
        code, res = api("POST", f"/admin/issue-letters/{lid}/submit")
        if code != 200:
            sys.exit(f"검수 요청 실패 {code}: {res.get('detail')}")
    code, res = api("POST", f"/admin/issue-letters/{lid}/publish", {"actor": {"employee_no": "admin", "role": "admin"}})
    print("발행 완료" if code == 200 else f"발행 실패 {code}: {res.get('detail')}")


if __name__ == "__main__":
    main()
