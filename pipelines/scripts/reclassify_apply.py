#!/usr/bin/env python3
"""분류 개편 재분류를 운영 글에 적용한다(lens-cms-api POST /admin/posts/reclassify-by-slug).

입력은 reclassify_dryrun.py가 만든 CSV다. 적용 전에 반드시 --backup 으로 현재 분류를 JSON으로 저장하고, 기본은 dry-run(서버가 바꿀 내용만 돌려줌)이다.

사용(pipelines/ 에서):
  python3 scripts/reclassify_apply.py --csv <reclassify_dryrun.csv> --index <search-index.json> --backup <백업 JSON 경로> [--only 분류없음|하위없음|옛이름] [--limit N] [--apply]

대상(--only 로 나눠서 적용):
  분류없음  분류가 비어 있던 글 → 새 분류(판단불가는 건너뜀)
  하위없음  분류는 있고 하위 분류가 비어 있던 글 → 새 분류·하위 분류
  옛이름    위 두 종류가 아닌 나머지 글 중 옛 이름('증시', '금융·정책')을 새 이름('시그널', '금융')으로만 바꾼다(하위 분류는 그대로)
점검용 150건(kind=점검용)은 기존 분류와 비교만 한 것이라 적용하지 않는다.

안전장치: 서버가 하나라도 어긋나면 409로 그 묶음 전체를 바꾸지 않는다. 묶음은 200건씩이며 한 묶음마다 결과를 출력한다.
복구: 백업 JSON(slug → 이전 category·subcategory)으로 같은 엔드포인트를 다시 호출한다(--restore <백업 JSON>).
"""
import argparse
import csv
import json
import sys
import time
import urllib.error
import urllib.request

BASE = "http://13.223.179.151"
OLD_TO_NEW = {"증시": "시그널", "금융·정책": "금융"}
BATCH = 200


def token() -> str:
    import boto3  # noqa: lazy

    return boto3.client("ssm", region_name="us-east-1").get_parameter(Name="/sedaily-mbti/admin/lens-cms-api-token", WithDecryption=True)["Parameter"]["Value"]


def call(tok: str, items: list[dict], dry_run: bool) -> dict:
    req = urllib.request.Request(
        f"{BASE}/admin/posts/reclassify-by-slug",
        data=json.dumps({"items": items, "dry_run": dry_run}, ensure_ascii=False).encode("utf-8"),
        headers={"X-Internal-Token": tok, "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        raise SystemExit(f"서버가 거절함 HTTP {e.code}: {e.read().decode()[:500]}")


def fetch_current(slugs: list[str]) -> dict[str, dict]:
    """공개 API로 지금 분류를 읽는다(백업용). 목록은 최신 1,000건이 한계라 날짜별로 이어 받는다."""
    out: dict[str, dict] = {}
    dates = sorted({s[:10] for s in slugs if s[:4] == "2026"})
    for d in dates:
        url = f"{BASE}/api/v2/posts?channel=lens&date={d}&limit=1000"
        with urllib.request.urlopen(url, timeout=60) as r:
            for p in json.load(r).get("posts", []):
                out[p["id"]] = {"category": p.get("category"), "subcategory": p.get("subcategory")}
    return out


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--csv")
    ap.add_argument("--index", help="검색용 목록 JSON(옛이름 대상 계산용)")
    ap.add_argument("--backup", required=True)
    ap.add_argument("--only", choices=["분류없음", "하위없음", "옛이름"])
    ap.add_argument("--limit", type=int)
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--restore", action="store_true", help="백업 JSON으로 되돌린다(--backup 경로를 읽음). 옛 이름 값도 그대로 복원")
    args = ap.parse_args()
    tok = token()

    if args.restore:
        bak = json.load(open(args.backup, encoding="utf-8"))
        items = [{"slug": s, "category": v["category"], "subcategory": v["subcategory"]} for s, v in bak.items() if v["category"]]
        print(f"복원 대상 {len(items)}건(분류가 있던 글만. 분류 없음이던 글은 서버가 null 분류를 받지 않아 건너뜀)")
        # 복원은 옛 이름('증시' 등)을 쓸 수 있어야 하는데 서버는 새 9개만 허용하므로, 옛 이름은 새 이름으로 맞춘다.
        for it in items:
            it["category"] = OLD_TO_NEW.get(it["category"], it["category"])
        for i in range(0, len(items), BATCH):
            res = call(tok, items[i : i + BATCH], dry_run=not args.apply)
            print(f"  묶음 {i // BATCH + 1}: {res['count']}건 {'복원' if args.apply else '(dry-run)'}")
        return

    rows = list(csv.DictReader(open(args.csv, encoding="utf-8")))
    plan: list[dict] = []
    csv_slugs = {r["id"] for r in rows if r["kind"] != "점검용"}
    if args.only in (None, "분류없음", "하위없음"):
        for r in rows:
            kind = r["kind"]
            if kind == "점검용":
                continue
            if args.only and kind != args.only:
                continue
            if not r["new_category"]:
                continue  # 판단불가는 건너뜀
            plan.append({"slug": r["id"], "category": r["new_category"], "subcategory": r["new_sub"] or None, "kind": kind})
    if args.only in (None, "옛이름"):
        if not args.index:
            raise SystemExit("옛이름 대상을 만들려면 --index 가 필요합니다")
        for it in json.load(open(args.index, encoding="utf-8"))["items"]:
            # 분류는 있고 하위 분류도 있는 글 중 옛 이름만 새 이름으로 바꾼다(하위 분류는 그대로). 재분류 대상(csv)에 든 글은 위에서 이미 처리한다.
            if it["c"] in OLD_TO_NEW and it["u"] and it["i"] not in csv_slugs:
                plan.append({"slug": it["i"], "category": OLD_TO_NEW[it["c"]], "subcategory": it["u"], "kind": "옛이름"})
    if args.limit:
        plan = plan[: args.limit]
    print(f"적용 대상 {len(plan)}건 ({'실제 적용' if args.apply else 'dry-run'})")
    if not plan:
        return

    # 백업: 적용 전 현재 분류(공개 API 기준)
    cur = fetch_current([p["slug"] for p in plan])
    bak = {p["slug"]: cur.get(p["slug"], {"category": None, "subcategory": None}) for p in plan}
    missing = [p["slug"] for p in plan if p["slug"] not in cur]
    if missing:
        # 삭제됐거나 공개 목록에 없는 글이다. 서버는 삭제된 글이 섞이면 묶음 전체를 거절하므로 계획에서 뺀다.
        print(f"제외: 공개 API에 없는 글 {len(missing)}건(삭제됐거나 미공개) 예: {missing[:3]}")
        plan = [p for p in plan if p["slug"] in cur]
        bak = {p["slug"]: cur[p["slug"]] for p in plan}
    json.dump(bak, open(args.backup, "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"백업 저장: {args.backup} ({len(bak)}건)")

    changed = 0
    for i in range(0, len(plan), BATCH):
        chunk = [{k: v for k, v in p.items() if k != "kind"} for p in plan[i : i + BATCH]]
        res = call(tok, chunk, dry_run=not args.apply)
        diff = sum(1 for c in res["changes"] if c["before"] != c["after"])
        changed += diff
        print(f"  묶음 {i // BATCH + 1}: {res['count']}건 중 값이 바뀌는 글 {diff}건 {'(적용됨)' if args.apply else '(dry-run)'}")
        if args.apply:
            time.sleep(1)
    print(f"완료: 총 {len(plan)}건 중 값이 바뀐 글 {changed}건")


if __name__ == "__main__":
    sys.exit(main())
