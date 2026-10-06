#!/usr/bin/env python3
"""지정한 글의 레터를 최신 발행 프롬프트로 다시 생성한다(repair_short_letters.py의 정상 글 가드를 푼 변형, 2026-10-06).

원문 기사를 다시 찾아 레터만 재생성하고, 글의 나머지(웹툰·팟캐스트·영상 등)는 건드리지 않는다.

사용(pipelines/ 에서):
  python3 scripts/repair_short_letters.py <source_url> [<source_url> ...]            # 드라이런(쓰기 없음)
  python3 scripts/repair_short_letters.py --apply <source_url> [...]                  # 실제 저장

안전장치:
  - 드라이런은 새 레터를 DRYRUN_DIR에 저장만 한다(비교용).
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

# v15(HTML 출력)를 사이트 문단 파서가 받는 텍스트 형식으로 옮긴 프롬프트를 이 실행에서만 쓴다 — CMS에 저장된 정본은 건드리지 않는다.
import ddb_prompt as _ddb  # noqa: E402

_ADAPTED = (ROOT.parent / "docs" / "prompt" / "letters" / "v16-site-text-2026-10-06.md").read_text(encoding="utf-8")
_orig_load = _ddb.load_prompt
_ddb.load_prompt = lambda category, name="published": _ADAPTED if (category, name) == ("letters", "published") else _orig_load(category, name)
BACKUP_DIR = HERE / "repair_backup"
DRYRUN_DIR = HERE / "regen_dryrun"


# 정형 틀 예산(공백 제외 글자 수). docs/prompt/letters/letter-template-v1-2026-10-06.md와 같은 값.
BUDGET = {"lead": (120, 180), "body": (170, 330), "more": (120, 200), "takeaway": (80, 140), "note": (140, 200),
          "vote": (40, 90), "summary": (170, 240), "total": (1300, 1650)}
# 본론 칸이 3개면 합계 기준이 낮아진다(칸 하나가 빠지는 만큼). 4개일 때가 금값 샘플 구조다.
TOTAL_BY_BODY_COUNT = {3: (1050, 1350), 4: (1300, 1650)}


def _n(text: str) -> int:
    return len(re.sub(r"\s", "", text))


def check_template(paragraphs: list[str], bullets: list[str], title: str) -> tuple[list[tuple[str, int, tuple[int, int], bool]], list[str]]:
    """칸별 글자 수를 예산과 대조한다. (행 목록, 위반 설명 목록)을 돌려준다."""
    rows: list[tuple[str, int, tuple[int, int], bool]] = []
    secs: list[tuple[str, str, int]] = []  # (kind, label, chars)
    first = paragraphs[0] if paragraphs else ""
    lead = first.split(title, 1)[1] if title and title in first else first
    secs.append(("lead", "리드", _n(lead)))
    cur = None
    for p in paragraphs[1:]:
        if p.startswith(("◾", "##")):
            h = p.lstrip("◾# ").strip()
            kind = "takeaway" if "한 가지만" in h else "note" if "에디터" in h else "vote" if "투표" in h else "more" if "더 보기" in h else "body"
            cur = [kind, h[:18], 0]
            secs.append(cur)  # type: ignore[arg-type]
        elif cur is not None:
            cur[2] += _n(p)
    bad: list[str] = []
    for kind, label, chars in secs:
        lo, hi = BUDGET[kind]
        ok = lo <= chars <= hi
        rows.append((label, chars, (lo, hi), ok))
        if not ok:
            bad.append(f"{label}: {chars}자 (예산 {lo}~{hi}자, {'줄일 것' if chars > hi else '늘릴 것'} — 목표 {(lo + hi) // 2}자 안팎)")
    s_chars = sum(_n(b) for b in bullets)
    lo, hi = BUDGET["summary"]
    rows.append(("1분 요약", s_chars, (lo, hi), lo <= s_chars <= hi))
    if not lo <= s_chars <= hi:
        bad.append(f"[핵심 요약]: {s_chars}자 (예산 {lo}~{hi}자 — 목표 {(lo + hi) // 2}자 안팎)")
    total = sum(c for k, _, c in secs if k in ("lead", "body", "more", "takeaway", "note"))
    n_body = sum(1 for k, _, _ in secs if k == "body")
    lo, hi = TOTAL_BY_BODY_COUNT.get(n_body, BUDGET["total"])
    rows.append((f"본문 합계(본론 {n_body}칸)", total, (lo, hi), lo <= total <= hi))
    if not lo <= total <= hi:
        bad.append(f"본문 합계: {total}자 (예산 {lo}~{hi}자 — 목표 {(lo + hi) // 2}자 안팎. 칸을 늘리거나 줄일 때 다른 칸 예산을 넘기지 않는다)")
    if not 3 <= n_body <= 4:
        bad.append(f"본론 칸 {n_body}개 (3~4개여야 함)")
    return rows, bad


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
    best = None
    feedback = ""
    for attempt in range(1, 6):
        article_path.write_text(text + feedback, encoding="utf-8")
        path = letters_mod.run_article(name, str(article_path), out_dir)
        raw = path.read_text(encoding="utf-8")
        paragraphs = pu.parse_letters(raw)
        terms = pu.parse_letter_terms(raw)
        print(f"   시도 {attempt}: {len(paragraphs)}문단")
        if len(paragraphs) < pu.MIN_LETTER_PARAGRAPHS:
            continue
        title = pu.parse_letter_title(raw) or ""
        _, bad = check_template(paragraphs, pu.parse_letter_summary_bullets(raw), title)
        print(f"   분량 점검: 위반 {len(bad)}건")
        if best is None or len(bad) < best[0]:
            best = (len(bad), paragraphs, terms, raw)
        if not bad:
            break
        feedback = "\n\n---\n[분량 점검 피드백 — 직전 결과가 예산을 벗어났다. 아래를 고쳐 처음부터 다시 쓴다]\n" + "\n".join(f"- {b}" for b in bad)
    if best is not None:
        _, paragraphs, terms, raw = best
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
            date = _kst_ymd(cur.get("published_at")) if cur.get("published_at") else (cur.get("publish_date") or "").replace("-", "")
            print(f"대상 {su} | 현재 {n_now}문단 | 발행일 {date}")
            article = _load_article(su, date)
            article["date"] = date  # 원문 date는 "2026-10-06" 형식인데 extract_facts는 YYYYMMDD를 기대한다 — 안 맞추면 기준일이 깨져 "5일"이 엉뚱한 달로 환산된다
            dry_file = DRYRUN_DIR / f"dry_{article['key']}.json"
            if APPLY and dry_file.exists():
                # 사용자가 드라이런으로 확인한 결과를 그대로 저장한다(다시 생성하면 확인한 글과 달라진다). 제목 보정은 드라이런 때 이미 끝났다.
                saved = json.load(open(dry_file, encoding="utf-8"))
                paragraphs, terms, bullets = saved["new"], saved["terms"], saved.get("bullets") or []
                print(f"   드라이런 확인본 사용: {dry_file.name}")
            else:
                paragraphs, terms, raw = _generate(article, article["key"])
                bullets = pu.parse_letter_summary_bullets(raw)
                if len(paragraphs) < pu.MIN_LETTER_PARAGRAPHS:
                    print(f"FAIL 재생성도 {len(paragraphs)}문단 — 저장 안 함 {su}")
                    continue
                old_title = _letter(body).get("question") or ""
                if old_title:
                    paragraphs = _keep_title(paragraphs, raw, old_title)
            if not APPLY:
                print(f"DRY  저장 예정: {n_now} -> {len(paragraphs)}문단, 용어 {len(terms)}개")
                rows, bad = check_template(paragraphs, bullets, old_title)
                for label, chars, (lo, hi), ok in rows:
                    print(f"   {'OK ' if ok else 'XX '} {label:<20} {chars:>5}자  (예산 {lo}~{hi})")
                DRYRUN_DIR.mkdir(exist_ok=True)
                json.dump({"old": _letter(body).get("paragraphs"), "new": paragraphs, "terms": terms, "bullets": bullets},
                          open(DRYRUN_DIR / f"dry_{article['key']}.json", "w"), ensure_ascii=False, indent=1)
                continue
            json.dump(cur, open(BACKUP_DIR / f"backup_{admin_id}.json", "w"), ensure_ascii=False, indent=1)
            new_body = json.loads(json.dumps(body))
            lt = _letter(new_body)
            lt["paragraphs"] = paragraphs
            if terms:
                lt["keywords"] = terms
            if bullets:
                lt["bullets"] = bullets  # 1분 요약 박스가 쓰는 핵심 요약 불릿
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
