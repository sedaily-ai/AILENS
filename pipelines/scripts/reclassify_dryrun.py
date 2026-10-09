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

import publish_utils as pu  # noqa: E402
from bedrock_client import call_text  # noqa: E402

# 새 대분류와 하위 분류(하위는 영문 메뉴 체계 기준 후보. 시험 실행에서 글이 실제로 몇 건 나오는지 본다).
TAXONOMY = {
    "시그널": ["국내증시", "해외증시", "IB&Deal", "펀드·채권", "정책", "증권일반"],
    "부동산": ["정책", "부동산일반", "건설업계"],
    "경제": ["경제분석", "세금·재정", "통상", "기후에너지", "경제일반"],
    "금융": ["은행", "보험", "카드", "가상자산", "금융일반"],
    "산업": ["대기업", "중기·IT", "유통·생활", "바이오", "기업인", "투자·재무", "기업일반"],
    "정치": ["청와대", "국회", "총리실", "통일·외교·안보", "정치일반"],
    "사회": ["사회일반", "사건사고", "법조", "교육", "노동·고용", "행정", "지방자치"],
    "국제": ["미국·중남미", "일본·중국", "아시아·호주", "유럽", "중동·아프리카"],
    "문화": ["전시·공연", "영화·미디어", "출판", "여행·레저", "문화일반", "아트씽"],
}
# 글에 저장돼 있는 옛 분류 이름 → 새 대분류(비교용).
OLD_TO_NEW = {"증시": "시그널", "금융·정책": "금융"}
NEW_NAMES = set(TAXONOMY)

BATCH = 15
VALIDATION_N = 150
MODEL = pu._SUBCATEGORY_MODEL  # 분류 전용 inference profile(비용 태그 경로)

GUIDE = """대분류(정확히 아래 단어 중 하나)와 그 하위 분류 후보:
{tax}

대분류 기준:
- 시그널: 주식·증시·코스피·종목·펀드·채권·IPO·공시·M&A·딜 등 자본시장 기사
- 부동산: 집값·전세·분양·공급대책·건설
- 경제: 성장률·물가·재정·세금·예산·관세·무역·에너지 정책 등 거시경제와 정부 경제정책
- 금융: 은행·보험·카드·가상자산·금융당국·금리·대출
- 산업: 개별 기업·산업 동향(반도체·자동차·배터리·유통·바이오 등), 기업 경영
- 정치: 대통령실·국회·여야·총리·선거·외교·안보·북한
- 사회: 사건사고·재판·검찰·교육·노동·고용·복지·인구·지방자치·보건·환경
- 국제: 해외 정치·경제·기업 이슈(미국·중국·일본·유럽·중동 등)
- 문화: 전시·공연·영화·출판·여행·라이프스타일

규칙:
- 기사 하나당 대분류 하나와 그 대분류의 하위 분류 후보 중 하나를 고른다. 후보에 맞는 게 없으면 '○○일반'(있으면) 또는 null.
- 판단이 어려우면 category를 null로 둔다(억지로 고르지 않는다).
- 출력은 JSON 배열만. 설명·코드블록 금지. 형식: [{{"id":"…","category":"…","sub":"…"}}, …]
"""


def build_system() -> str:
    tax = "\n".join(f"- {k}: {', '.join(v)}" for k, v in TAXONOMY.items())
    return GUIDE.format(tax=tax)


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
    cat, sub = res.get("category"), res.get("sub")
    if cat not in NEW_NAMES:
        return None, None
    if sub not in TAXONOMY[cat]:
        sub = None
    return cat, sub


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
