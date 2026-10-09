#!/usr/bin/env python3
"""분류 개편 시험 실행(dry-run) — 새 대분류 9개로 글을 다시 분류해 보고 결과만 파일로 남긴다.

DB·CMS는 읽지도 쓰지도 않는다. 입력은 검색용 목록(/api/search-index 응답 JSON)이고, 출력은 JSON·CSV 파일이다.
대상: 분류가 없거나(category 빈 값) 하위 분류가 없는 글 전부 + 이미 분류된 글 150건(정확도 점검용, 기존 분류와 비교만 한다).

사용(pipelines/ 에서):
  python3 scripts/reclassify_dryrun.py --input <search-index.json> --out <출력 폴더>

분류표는 docs/product/분류체계/README.md · service/frontend/src/shared/constants/menuTaxonomy.ts 와 같다.
Bedrock은 publish_utils.display_subcategory 와 같은 application inference profile(비용 태그가 붙는 경로)로 호출한다.
"""
import argparse
import csv
import json
import random
import re
import sys
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
for p in (ROOT / "common", ROOT):
    sys.path.insert(0, str(p))

import taxonomy as tx  # noqa: E402
from bedrock_client import call_text  # noqa: E402

# 분류표·프롬프트·검증은 발행과 같은 모듈(common/taxonomy.py)을 쓴다.
TAXONOMY = tx.TAXONOMY
OLD_TO_NEW = tx.OLD_TO_NEW
NEW_NAMES = tx.NEW_NAMES
BATCH = 15
VALIDATION_N = 150
MODEL = tx.CLASSIFY_MODEL


def build_system() -> str:
    return tx.build_system(json_array=True)


def parse(raw: str) -> list[dict]:
    m = re.search(r"\[.*\]", raw, re.S)
    if not m:
        raise ValueError(f"JSON 배열 없음: {raw[:120]}")
    return json.loads(m.group(0))


def classify_batch(items: list[dict]) -> dict[str, dict]:
    user = "\n".join(f'{{"id":"{it["i"]}","제목":{json.dumps(it["h"], ensure_ascii=False)},"요약":{json.dumps(it["s"], ensure_ascii=False)}}}' for it in items)
    for attempt in range(3):
        try:
            raw = call_text(build_system(), user, model=MODEL, max_tokens=1800)
            out = {r["id"]: r for r in parse(raw) if isinstance(r, dict) and "id" in r}
            return out
        except Exception as e:  # noqa: BLE001 — 한 묶음 실패가 전체를 막지 않게 재시도
            if attempt == 2:
                print(f"  묶음 실패({len(items)}건): {e}", file=sys.stderr)
    return {}


def clean(res: dict | None) -> tuple[str | None, str | None]:
    if not res:
        return None, None
    return tx.clean(res.get("category"), res.get("sub"))


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--input", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    items = json.loads(Path(args.input).read_text(encoding="utf-8"))["items"]
    out_dir = Path(args.out)
    out_dir.mkdir(parents=True, exist_ok=True)

    targets = [it for it in items if not it["c"] or not it["u"]]
    labeled = [it for it in items if it["c"] and it["u"]]
    random.seed(20261009)
    validation = random.sample(labeled, min(VALIDATION_N, len(labeled)))
    work = targets + validation
    print(f"전체 {len(items)}건 · 대상 {len(targets)}건(분류 없음 {sum(1 for t in targets if not t['c'])}, 하위 없음 {sum(1 for t in targets if t['c'] and not t['u'])}) · 점검용 {len(validation)}건")

    batches = [work[i : i + BATCH] for i in range(0, len(work), BATCH)]
    results: dict[str, dict] = {}
    with ThreadPoolExecutor(4) as ex:
        for n, res in enumerate(ex.map(classify_batch, batches), 1):
            results.update(res)
            if n % 10 == 0 or n == len(batches):
                print(f"  {n}/{len(batches)} 묶음 완료")

    rows = []
    val_ids = {v["i"] for v in validation}
    for it in work:
        cat, sub = clean(results.get(it["i"]))
        old_cat = OLD_TO_NEW.get(it["c"], it["c"])
        rows.append(
            {
                "id": it["i"], "date": it["d"], "headline": it["h"], "summary": it["s"],
                "old_category": it["c"], "old_sub": it["u"], "new_category": cat, "new_sub": sub,
                "kind": "점검용" if it["i"] in val_ids else ("분류없음" if not it["c"] else "하위없음"),
                "cat_match": (cat == old_cat) if it["i"] in val_ids else "",
                "sub_match": (sub == it["u"]) if it["i"] in val_ids else "",
            }
        )
    (out_dir / "reclassify_dryrun.json").write_text(json.dumps(rows, ensure_ascii=False, indent=1), encoding="utf-8")
    with (out_dir / "reclassify_dryrun.csv").open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader()
        w.writerows(rows)
    print(f"저장: {out_dir}/reclassify_dryrun.(json|csv)  {len(rows)}건, 응답 없음 {sum(1 for r in rows if r['new_category'] is None and r['id'] not in results)}건")


if __name__ == "__main__":
    main()
