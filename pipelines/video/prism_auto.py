"""PRISM 자동 제작 1단계 — 서울경제 일일 기사 XML에서 그날의 AI 프리즘 기사 8개를 찾아
그룹별 기사 파일(txt)을 만든다(2026-11-05).

지금까지는 마케팅팀이 프리즘 기사에 링크된 원문 6건을 손으로 복사해 `MMDD_항목명.txt`로 만든 뒤
CMS "PRISM 제작" 화면에 올렸다. 그 txt를 코드가 똑같이 만든다. 뒤 단계(대본 → 장면 → 렌더 → 유튜브)는
기존 일괄 제작(admin/backend/routes/prism_batch.py → pipelines/video/prism_batch.py)을 그대로 쓴다.

확인한 사실(2026-11-04~05, daily-xml 조회):
- 프리즘 기사는 subTitle이 "■AI 프리즘 [OO 뉴스]"로 시작하고 그룹마다 하루 1건, 8개 그룹이다.
- 본문에 번호 붙은 원문 링크 1.~6.이 있다(맨 아래 "▶기사 바로가기"는 그룹과 무관한 홍보 링크라 제외).
- 원문은 대부분 전날 저녁 게재라 전날 XML에 있다. 일요일 프리즘(원문 4건)은 금요일 기사다 → 당일~3일 전 XML에서 찾는다.
- 10/21 마케팅팀 txt 7개의 기사 번호가 이 링크와 모두 6/6 일치했다.
- 게재 시각: 평일 대개 10:00(10/26 월요일은 10:42), 일요일 9시대, 토요일은 없음.

매일 자동 시작은 CMS 백엔드 admin/backend/routes/prism_schedule.py가 collect()를 불러 한다.

로컬 시험: python pipelines/video/prism_auto.py --date 20261021 --out <폴더> --profile sedaily
"""
from __future__ import annotations

import argparse
import datetime as dt
import html
import importlib.util
import re
import xml.etree.ElementTree as ET
from pathlib import Path

_ROOT = Path(__file__).resolve().parent.parent


def _load_discovery():
    # XML 버킷·파싱 규칙은 discovery/pipeline.py 한 곳에 둔다(frontpage_auto/run.py와 같은 방식으로 불러온다).
    # CMS 백엔드 Lambda(admin, flat zip)에는 deploy-admin-api.sh가 그 파일을 discovery_pipeline.py로 옆에 복사한다.
    for path in (_ROOT / "discovery" / "pipeline.py", Path(__file__).resolve().parent / "discovery_pipeline.py"):
        if path.exists():
            spec = importlib.util.spec_from_file_location("prism_auto_discovery", path)
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            return module
    raise ModuleNotFoundError("discovery/pipeline.py(또는 discovery_pipeline.py)를 찾지 못했습니다")


discovery = _load_discovery()

# XML의 "[OO 뉴스]" 이름 → (파일 이름 항목명, 그룹 코드). 항목명·코드는 화면 admin/frontend/src/lib/prismBatch.ts
# PRISM_GROUPS의 keyword·code와 같다(10/21 샘플 대조로 확인한 대응).
XML_GROUPS = {
    "캠퍼스 뉴스": ("취준생", "SG1"),
    "신입 직장인 뉴스": ("신입직장인", "SG2"),
    "스타트업 뉴스": ("스타트업", "SG3"),
    "글로벌 뉴스": ("글로벌", "SG4"),
    "CEO 뉴스": ("기업", "SG5"),
    "금융상품 뉴스": ("금융", "SG6"),
    "부동산 뉴스": ("부동산", "SG7"),
    "주식 뉴스": ("주식", "SG8"),
}
EXPECTED_COUNT = len(XML_GROUPS)

_PRISM_RE = re.compile(r"프리즘\s*\[([^\]]+)\]")
# 본문 안 소제목("[부동산 투자자 관심 뉴스]")과 원문 링크를 나온 순서대로 읽는다.
# 링크 글자("1. 제목")의 번호 모양에는 기대지 않는다 — 편집자가 손으로 써서 "1 제목"(10/29), ". 제목"(9/28),
# "<b>3</b>. 제목"(8/26)처럼 제각각이다. 대신 홍보 구역 전까지의 서울경제 기사 링크 중 글자가 있는 것을 차례로 받는다
# (글자 없는 빈 링크가 섞여 있다). 주소도 signal.sedaily.com(마켓시그널, 10/26), "undefined: https://…"(10/25)가 있어
# href 안에 sedaily.com/article/번호 가 있기만 하면 받는다.
_TOKEN_RE = re.compile(
    r"<b>\s*\[(?P<section>[^\]]+)\]\s*</b>"
    r"|<a\s[^>]*href=\"[^\"]*sedaily\.com/article/(?P<key>\d+)[^\"]*\"[^>]*>(?P<anchor>.*?)</a>",
    re.S,
)
_TAG_RE = re.compile(r"<[^>]+>")
# 그 아래 "▶기사 바로가기"부터는 그룹과 무관한 홍보 링크다. 화살표까지 본다 — 9월 글은 기사마다
# "- 기사 바로가기: 주소" 줄이 있어 화살표 없이 자르면 3번 기사에서 끊긴다(9/22 글로벌).
_PROMO_MARK = "▶기사 바로가기"
# 평일 6건, 일요일 4건(11/1 확인).
MAX_LINKS = 6
# 원문은 대개 전날 저녁 기사지만, 토요일엔 신문이 없어 일요일 프리즘은 금요일 기사를 쓴다(11/1 → 10/30).
LOOKBACK_DAYS = 3


def _text(item: ET.Element, tag: str) -> str:
    return (item.findtext(tag) or "").strip()


def find_prism_items(items: list[ET.Element]) -> list[dict]:
    """그날 XML의 프리즘 기사 → [{xml_group, label, type, key, date, links:[{key, num, section}]}]."""
    found = []
    for item in items:
        m = _PRISM_RE.search(_text(item, "subTitle"))
        if not m:
            continue
        xml_group = m.group(1).strip()
        label, type_code = XML_GROUPS.get(xml_group, (None, None))
        links, section = [], ""
        content = (item.findtext("content") or "").split(_PROMO_MARK)[0]
        for t in _TOKEN_RE.finditer(content):
            if len(links) >= MAX_LINKS:
                break
            if t.group("section"):
                section = t.group("section").strip()
            elif _TAG_RE.sub("", t.group("anchor")).strip() and t.group("key") not in {x["key"] for x in links}:
                # 같은 기사를 두 번 건 실수(9/17 부동산 2·4번)는 한 번만 넣는다.
                links.append({"key": t.group("key"), "num": len(links) + 1, "section": section})
        found.append({
            "xml_group": xml_group, "label": label, "type": type_code,
            "key": _text(item, "key"), "date": _text(item, "date"), "time": _text(item, "time"),
            "links": links,
        })
    return found


def _paper(article: dict) -> str:
    # 마케팅팀 txt의 "지면:" 칸 — 지면 배치가 있으면 "1면", 없으면 "온라인".
    return f"{article['paper_number']}면" if article.get("paper_number") else "온라인"


def _article_block(raw: ET.Element) -> str:
    a = discovery._parse_item(raw)
    categories = ", ".join(c.split(",")[0] for c in a["categories"] if c)
    return (
        f"제목: {html.unescape(a['title'])}\n"
        f"기자: {_text(raw, 'author')}\n"
        f"날짜: {a['date']} {a['time']}\n"
        f"지면: {_paper(a)}\n"
        f"카테고리: {categories}\n"
        f"URL: {a['url'] or ''}\n\n"
        f"{a['content']}\n"
    )


_SEPARATOR = "═" * 60


def build_txt(prism: dict, pool: dict[str, ET.Element]) -> tuple[str, list[str]]:
    """프리즘 기사 1개 → (txt 내용, 못 찾은 원문 번호들). 기사 순서는 프리즘 기사 그대로.

    모양은 마케팅팀이 손으로 만들던 txt와 똑같이 한다 — 머리글·소제목·번호표 없이 기사만, 사이에 ═ 선.
    2026-11-05 시험에서 "[OO 관심 뉴스]/[OO 참고 뉴스]" 소제목을 붙였더니 대본이 "참고 뉴스"(4~6번)를 자주 빼
    평균 4.25/6건만 썼다(마케팅 txt 12편은 5.25/6건)."""
    blocks, missing = [], []
    for link in prism["links"]:
        raw = pool.get(link["key"])
        if raw is None:
            missing.append(link["key"])
            continue
        blocks.append(_article_block(raw).rstrip("\n"))
    return f"\n\n{_SEPARATOR}\n".join(blocks) + f"\n\n{_SEPARATOR}", missing


def _items(s3, yyyymmdd: str) -> list[ET.Element]:
    root = discovery._download_root(s3, yyyymmdd)
    return [] if root is None else list(root.iter("item"))


def collect(day: dt.date, profile: str | None = None) -> list[dict]:
    """그날 프리즘 기사마다 txt를 만든다 → [{file_name, type, recording_date, text, missing, ...}]."""
    s3 = discovery._s3_client(profile)
    today_items = _items(s3, f"{day:%Y%m%d}")
    pool: dict[str, ET.Element] = {}
    # 오래된 날부터 채워, 같은 기사가 여러 파일에 있으면 가장 최근 파일(나중 수정본)이 남게 한다.
    for back in range(LOOKBACK_DAYS, 0, -1):
        for i in _items(s3, f"{day - dt.timedelta(days=back):%Y%m%d}"):
            pool[_text(i, "key")] = i
    for i in today_items:
        pool[_text(i, "key")] = i

    results = []
    for prism in find_prism_items(today_items):
        text, missing = build_txt(prism, pool)
        results.append({
            **prism,
            "file_name": f"{day:%m%d}_{prism['label']}.txt" if prism["label"] else None,
            "recording_date": day.isoformat(),
            "text": text,
            "missing": missing,
            "newest_source": max(
                (f"{_text(pool[x['key']], 'date')} {_text(pool[x['key']], 'time')}"
                 for x in prism["links"] if x["key"] in pool),
                default="",
            ),
        })
    return _drop_duplicates(results)


def _drop_duplicates(results: list[dict]) -> list[dict]:
    """같은 그룹이 하루에 2개면 하나만 남긴다. 9/22에 전날 빠진 금융상품을 늦게 올려 금융상품이 2개였다 —
    링크된 원문이 더 최근인 쪽이 그날 것이다. 버린 쪽은 남긴 쪽의 duplicates에 적어 알림에 쓴다."""
    kept: dict[str, dict] = {}
    for r in sorted(results, key=lambda x: x["newest_source"], reverse=True):
        group = r["xml_group"]
        if group in kept:
            kept[group].setdefault("duplicates", []).append(r["key"])
        else:
            kept[group] = r
    return [r for r in results if kept.get(r["xml_group"]) is r]


def main() -> None:
    parser = argparse.ArgumentParser(description="daily-xml의 AI 프리즘 기사 → 그룹별 기사 txt")
    parser.add_argument("--date", required=True, help="프리즘 기사가 올라온 날 YYYYMMDD(= 영상 날짜)")
    parser.add_argument("--out", required=True, help="txt를 저장할 폴더")
    parser.add_argument("--profile", default=None, help="AWS 프로필(로컬 시험용)")
    args = parser.parse_args()

    day = dt.datetime.strptime(args.date, "%Y%m%d").date()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    results = collect(day, args.profile)
    print(f"[prism-auto] {day} 프리즘 기사 {len(results)}/{EXPECTED_COUNT}건")
    for r in results:
        status = "OK" if not r["missing"] and len(r["links"]) in (4, 6) else "확인 필요"
        print(f"  {r['xml_group']} → {r['file_name']} ({r['type']}) 원문 {len(r['links']) - len(r['missing'])}/{len(r['links'])} {status}")
        if r["missing"]:
            print(f"    못 찾은 원문: {r['missing']}")
        if r.get("duplicates"):
            print(f"    같은 그룹 프리즘 기사가 더 있어 제외: {r['duplicates']} (남긴 것 {r['key']})")
        if r["file_name"]:
            (out / r["file_name"]).write_text(r["text"], encoding="utf-8")
        else:
            print(f"    알 수 없는 그룹 이름 — XML_GROUPS에 추가 필요: {r['xml_group']}")


if __name__ == "__main__":
    main()
