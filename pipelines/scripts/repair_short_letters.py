#!/usr/bin/env python3
"""본문이 1문단뿐인 레터(생성 실패 후 그대로 발행된 글)를 레터만 다시 생성해 복구한다.

원문 기사를 다시 찾아 레터만 재생성하고, 글의 나머지(웹툰·팟캐스트·영상 등)는 건드리지 않는다.

사용(pipelines/ 에서):
  python3 scripts/repair_short_letters.py <source_url> [<source_url> ...]            # 드라이런(쓰기 없음)
  python3 scripts/repair_short_letters.py --apply <source_url> [...]                  # 실제 저장

안전장치:
  - 현재 레터가 MIN_LETTER_PARAGRAPHS 미만인 글만 대상(정상 글은 건너뜀).
  - 재생성 결과도 MIN_LETTER_PARAGRAPHS 이상일 때만 저장(최대 3번 시도).
  - 저장 전 글 전체를 backup 폴더에 JSON으로 보관.
  - 저장 후 재조회해 레터 외 나머지(다른 포맷, 카테고리 등)가 그대로인지 검증.
관리자 토큰은 SSM(/sedaily-mbti/admin/lens-cms-api-token)에서 읽는다(lens_cms_client).
"""
import json
import re
import sys
import tempfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent  # pipelines/
for p in (ROOT / "common", ROOT):
    sys.path.insert(0, str(p))

import requests  # noqa: E402

import lens_cms_client as cms  # noqa: E402
import publish_utils as pu  # noqa: E402

APPLY = "--apply" in sys.argv
BACKUP_DIR = HERE / "repair_backup"


def _letter(body_inline: dict) -> dict:
    return next(l for l in body_inline["lenses"] if l.get("label") == "레터")


def _admin(method: str, path: str, body=None):
    res = requests.request(
        method, f"{cms.LENS_CMS_API_URL}{path}", json=body, headers=cms._headers(), timeout=(5, 60)
    )
    res.raise_for_status()
    return res.json()


def _load_article(source_url: str, date_yyyymmdd: str) -> dict:
    """원문 기사 — mustknow_auto가 쓰는 discovery.fetch_articles와 같은 경로."""
    discovery = pu.load_module("repair_discovery", ROOT / "discovery" / "pipeline.py")
    key = re.search(r"/article/(\d+)", source_url).group(1)
    for a in discovery.fetch_articles(date_yyyymmdd):
        if str(a.get("key")) == key:
            return a
    raise RuntimeError(f"원문 후보에서 {key}를 못 찾음({date_yyyymmdd})")


def _generate(article: dict, name: str) -> tuple[list[str], list[dict], str]:
    """레터만 재생성해 (문단, 용어) 반환. 문단이 부족하면 최대 3번 시도."""
    from facts_extract import extract_facts  # noqa: lazy

    letters_mod = pu.load_module("repair_letters", ROOT / "letters" / "pipeline.py")
    out_dir = Path(tempfile.mkdtemp(prefix="repair_letters_"))
    facts = extract_facts(article["content"], article.get("date", ""))
    text = article["content"] + (f"\n\n---\n[공용 팩트시트]\n{facts}" if facts else "")
    article_path = out_dir / f"{name}_article.txt"
    article_path.write_text(text, encoding="utf-8")
    paragraphs: list[str] = []
    terms: list[dict] = []
    raw = ""
    for attempt in range(1, 4):
        path = letters_mod.run_article(name, str(article_path), out_dir)
        raw = path.read_text(encoding="utf-8")
        paragraphs = pu.parse_letters(raw)
        terms = pu.parse_letter_terms(raw)
        print(f"   시도 {attempt}: {len(paragraphs)}문단")
        if len(paragraphs) >= pu.MIN_LETTER_PARAGRAPHS:
            break
    return paragraphs, terms, raw


def _keep_title(paragraphs: list[str], raw: str, old_title: str) -> list[str]:
    """새 레터 첫 문단은 '새 제목 + 리드'인데, 글에 저장된 제목(question)은 옛 것이라 어긋난다. 제목 부분만 저장된 제목으로 바꿔
    페이지에 제목이 두 가지로 보이지 않게 한다."""
    new_title = pu.parse_letter_title(raw) or pu.extract_title_from_lead(paragraphs)
    first = paragraphs[0]
    if new_title and first.startswith(new_title):
        lead = first[len(new_title):].strip()
    else:
        lead = first
    paragraphs = list(paragraphs)
    paragraphs[0] = f"{old_title} {lead}".strip()
    return paragraphs


def _revalidate():
    """저장 직후 사이트 캐시를 갱신(파이프라인과 같은 방식). 실패해도 5분 TTL로 곧 반영되므로 경고만."""
    try:
        import boto3  # noqa: lazy

        secret = pu.get_revalidate_secret(boto3.Session(region_name="us-east-1"), log_prefix="repair")
        if secret:
            pu.notify_revalidate(secret, log_prefix="repair")
    except Exception as e:  # noqa: BLE001
        print(f"   (캐시 갱신 생략: {type(e).__name__})")


def _kst_ymd(ts: str) -> str:
    """발행 시각(ISO, UTC일 수 있음)을 KST 날짜(YYYYMMDD)로 변환한다. daily-xml은 KST 게재일 기준이라
    UTC 날짜를 쓰면 00~09시 KST 발행분의 원문을 못 찾는다."""
    from datetime import datetime, timedelta, timezone

    dt = datetime.fromisoformat(ts.replace("Z", "+00:00"))
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone(timedelta(hours=9))).strftime("%Y%m%d")


def main():
    urls = [a for a in sys.argv[1:] if not a.startswith("--")]
    if not urls:
        sys.exit("source_url을 하나 이상 넘겨 주세요.")
    BACKUP_DIR.mkdir(exist_ok=True)
    print(f"mode={'APPLY' if APPLY else 'DRY-RUN'} | 대상 {len(urls)}건")
    for su in urls:
        try:
            found = cms.find_by_source_url(su)
            if not found:
                print(f"SKIP 글 없음 {su}")
                continue
            admin_id = found.get("admin_post_id") or found["id"]
            cur = _admin("GET", f"/admin/posts/{admin_id}")["post"]
            body = cur["body_inline"]
            n_now = len(_letter(body).get("paragraphs") or [])
            if n_now >= pu.MIN_LETTER_PARAGRAPHS:
                print(f"SKIP 이미 정상({n_now}문단) {su}")
                continue
            date = _kst_ymd(cur.get("published_at")) if cur.get("published_at") else (cur.get("publish_date") or "").replace("-", "")
            print(f"대상 {su} | 현재 {n_now}문단 | 발행일 {date}")
            article = _load_article(su, date)
            paragraphs, terms, raw = _generate(article, article["key"])
            if len(paragraphs) < pu.MIN_LETTER_PARAGRAPHS:
                print(f"FAIL 재생성도 {len(paragraphs)}문단 — 저장 안 함 {su}")
                continue
            old_title = _letter(body).get("question") or ""
            if old_title:
                paragraphs = _keep_title(paragraphs, raw, old_title)
            if not APPLY:
                print(f"DRY  저장 예정: {n_now} -> {len(paragraphs)}문단, 용어 {len(terms)}개")
                continue
            json.dump(cur, open(BACKUP_DIR / f"backup_{admin_id}.json", "w"), ensure_ascii=False, indent=1)
            new_body = json.loads(json.dumps(body))
            lt = _letter(new_body)
            lt["paragraphs"] = paragraphs
            if terms:
                lt["keywords"] = terms
            _admin("PUT", f"/admin/posts/{admin_id}", {"channels": ["lens"], "body_inline": new_body})
            after = _admin("GET", f"/admin/posts/{admin_id}")["post"]["body_inline"]
            others_same = [l for l in body["lenses"] if l.get("label") != "레터"] == [
                l for l in after["lenses"] if l.get("label") != "레터"
            ]
            rest_same = {k: v for k, v in body.items() if k != "lenses"} == {k: v for k, v in after.items() if k != "lenses"}
            ok = len(_letter(after)["paragraphs"]) == len(paragraphs) and others_same and rest_same
            if ok:
                _revalidate()
            print(f"{'OK  ' if ok else 'WARN'} {su} | {len(_letter(after)['paragraphs'])}문단 | 다른 포맷 동일={others_same} 나머지 동일={rest_same}")
        except Exception as e:  # noqa: BLE001
            print(f"FAIL {su}: {type(e).__name__}: {e}")


if __name__ == "__main__":
    main()
