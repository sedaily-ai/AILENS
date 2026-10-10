#!/usr/bin/env python3
"""주제 사전 입력·태그 소급 — 서버에서 실행(관리 토큰은 PM2 환경에서 읽으며 출력하지 않는다).

  python3 seed_topics.py dict  <topics_seed.json>             # 사전 항목을 저장(slug 기준 추가·갱신, 이름·별칭 충돌이면 전체 거부)
  python3 seed_topics.py tag   <issue_letters_seed.json>      # 시드의 레터별 topics 를 이미 있는 레터(발행된 것 포함)에 적용
  python3 seed_topics.py bundles <interest_bundles_seed.json>  # 관심 묶음 저장(slug 기준 추가·갱신, 항목은 사전·분류와 대조)
  (--apply 없이 실행하면 드라이런: 무엇이 바뀌는지만 보여 준다)
"""
import json
import os
import subprocess
import sys
import urllib.error
import urllib.request

LOCAL = os.environ.get("LENS_API", "http://127.0.0.1:8000")


def token():
    t = os.environ.get("ADMIN_INTERNAL_TOKEN")
    if t:
        return t
    out = subprocess.run(["pm2", "jlist"], capture_output=True, text=True, check=True).stdout
    return json.loads(out)[0]["pm2_env"]["ADMIN_INTERNAL_TOKEN"]


def api(method, path, body=None):
    req = urllib.request.Request(LOCAL + path, method=method, data=None if body is None else json.dumps(body).encode(),
                                 headers={"Content-Type": "application/json", "X-Internal-Token": TOKEN})
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, json.loads(r.read() or b"{}")
    except urllib.error.HTTPError as e:
        try:
            return e.code, {"detail": json.loads(e.read()).get("detail")}
        except Exception:
            return e.code, {"detail": ""}


def main():
    global TOKEN
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    apply = "--apply" in sys.argv
    if len(args) != 2 or args[0] not in ("dict", "tag", "bundles"):
        sys.exit(__doc__)
    TOKEN = token()
    data = json.load(open(args[1], encoding="utf-8"))
    if args[0] == "bundles":
        print(f"관심 묶음 {len(data)}개, 항목 {sum(len(b['items']) for b in data)}개")
        if not apply:
            print("드라이런 끝 — 저장하지 않았습니다. --apply 로 저장합니다.")
            return
        code, res = api("PUT", "/admin/interest-bundles", {"bundles": data})
        print("저장 완료" if code == 200 else f"저장 실패 {code}: {res.get('detail')}", res if code == 200 else "")
        return
    if args[0] == "dict":
        code, cur = api("GET", "/admin/topics?include_inactive=true")
        have = {t["slug"] for t in cur.get("topics", [])} if code == 200 else set()
        new = [t for t in data if t["slug"] not in have]
        print(f"사전 {len(data)}개 중 새로 추가 {len(new)}개, 갱신 {len(data) - len(new)}개 (현재 {len(have)}개)")
        if not apply:
            print("드라이런 끝 — 저장하지 않았습니다. --apply 로 저장합니다.")
            return
        code, res = api("PUT", "/admin/topics", {"topics": data})
        print("저장 완료" if code == 200 else f"저장 실패 {code}: {res.get('detail')}", res if code == 200 else "")
        return
    code, res = api("GET", "/admin/issue-letters?limit=200")
    by_slug = {l["slug"]: l for l in res.get("letters", [])} if code == 200 else {}
    for l in data:
        cur = by_slug.get(l["slug"])
        if not cur:
            print(f"- {l['slug']}: 서버에 없음 — 건너뜀")
            continue
        print(f"- {l['slug']} (id {cur['id']}, {cur['status']}): 태그 {l['topics']}")
        if apply:
            code, r2 = api("PUT", f"/admin/issue-letters/{cur['id']}/topics", {"topics": l["topics"]})
            print("   적용:", [t["name"] for t in r2.get("topics", [])] if code == 200 else f"실패 {code}: {r2.get('detail')}")
    if not apply:
        print("드라이런 끝 — 적용하지 않았습니다. --apply 로 적용합니다.")


if __name__ == "__main__":
    main()
