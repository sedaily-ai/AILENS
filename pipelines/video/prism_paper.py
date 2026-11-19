"""PRISM 지면 영상(PG1~PG4) 자동 제작 1단계 — 그날 신문 지면에서 그룹별 기사 파일(txt)을 만든다(2026-11-18).

지금까지는 마케팅팀이 손으로 골라 만들었다. 유튜브에 올라간 수동 영상 8편(11/17·11/18)을 그날 지면과 대조한 결과:
- 시리즈 = Front Page(PG1)·Securities(PG2)·Industry(PG3)·Finance(PG4) Daily, 하루 4편, 영상 날짜 = 지면 날짜.
- 재료 = 섹션 첫 면의 TOP(맨 위) 기사 + 같은 면 기사 1개. 8편 모두 일치.
  두 번째 기사는 길이 순이 아니었다(사람이 고름) → AI가 고른다(choose_second).
- 섹션 첫 면: 1면은 고정. 금융·산업·증권은 6면 이후에서 그 면 기사 과반이 그 섹션인 첫 면
  (평일 금융 9면·산업 11면·증권 17~19면, 마켓시그널(Signal) 기사는 증권으로 센다). 11/4~11/19 지면으로 확인.
- 1~5면은 종합면이라 증권·산업 기사만 실린 날이 있어(11/18 3면 증권 2건) 섹션 첫 면 후보에서 뺀다.

뒤 단계(대본 → 장면 → 렌더 → 유튜브·데일리모션)는 SG 그룹과 같은 일괄 제작(pipelines/video/prism_batch.py)을 그대로 쓴다.

로컬 시험: python pipelines/video/prism_paper.py --date 20261118 --out <폴더> --profile sedaily
"""
from __future__ import annotations

import argparse
import collections
import datetime as dt
import html
import json
import os
import re
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Callable

import prism_auto

discovery = prism_auto.discovery

# 그룹 순서 = 지면 순서. 파일 이름 항목명은 화면 admin/frontend/src/lib/prismBatch.ts PRISM_GROUPS의 keyword와 같다.
SECTIONS = [
    # (그룹 코드, 파일 이름 항목명, 섹션 분류 — None이면 1면)
    ("PG1", "1면", None),
    ("PG2", "증권", "증권"),
    ("PG3", "산업", "산업"),
    ("PG4", "금융지면", "금융"),
]
_FIRST_SECTION_PAGE = 6  # 1~5면은 종합면
_MIN_BODY = 300  # 사진·짧은 기사 제외(국문 PRISM 자동화와 같은 기준)
_SKIP_CATEGORIES = {"오피니언", "피플"}
_SKIP_TITLE = re.compile(r"^\[(?:투자의 창|로터리|기자의 눈|사설)\]|\[부고\]|\[인사\]")
# PRISM 대본 AI와 같은 Haiku 프로파일(lens-prism-haiku-5-5). CMS 백엔드 역할에 이미 호출 권한이 있다.
MODEL_ID = os.environ.get(
    "PRISM_PAPER_MODEL",
    "arn:aws:bedrock:us-east-1:887078546492:application-inference-profile/njzeyj54dn12",
)


def _section_of(article: dict) -> str:
    return "증권" if article["is_market_signal"] or article["top_category"] == "Signal" else article["top_category"]


def paper_pages(day: dt.date, profile: str | None = None) -> tuple[dict[int, list[dict]], dict[str, ET.Element]]:
    """지면 날짜 day의 면별 기사 → ({면 번호: [기사(TOP 먼저)]}, {기사 key: XML item}).
    신문은 전날 저녁 마감이라 기사 대부분이 전날 XML에 있다. 당일·이틀 전 XML도 같이 본다(나중 파일의 수정본이 이긴다)."""
    s3 = discovery._s3_client(profile)
    target = f"{day:%Y%m%d}"
    items: dict[str, ET.Element] = {}
    for back in (2, 1, 0):
        for item in prism_auto._items(s3, f"{day - dt.timedelta(days=back):%Y%m%d}"):
            items[prism_auto._text(item, "key")] = item
    pages: dict[int, list[dict]] = collections.defaultdict(list)
    for key, item in items.items():
        a = discovery._parse_item(item)
        if not a or a["paper_publish_date"] != target or not (a["paper_number"] or "").isdigit():
            continue
        if int(a["paper_number"]) <= 0:
            continue
        a["section"] = _section_of(a)
        pages[int(a["paper_number"])].append(a)
    for arts in pages.values():
        arts.sort(key=lambda a: 0 if a["paper_paragraph"] == "TOP" else 1)
    return dict(pages), items


def section_page(pages: dict[int, list[dict]], section: str | None) -> int | None:
    if section is None:
        return 1 if 1 in pages else None
    # 그 면 기사 과반이 그 섹션인 첫 면. TOP 기사의 분류는 따지지 않는다 — 11/19 산업면(11면, 산업 5/6)의 TOP 기사
    # (로봇 RX)가 '경제'로 분류돼 18면으로 잘못 갔다.
    for n in sorted(p for p in pages if p >= _FIRST_SECTION_PAGE):
        arts = pages[n]
        top = next((a for a in arts if a["paper_paragraph"] == "TOP"), None)
        same = sum(1 for a in arts if a["section"] == section)
        if top and same * 2 > len(arts):
            return n
    return None


def _usable(a: dict) -> bool:
    return (a["content_len"] >= _MIN_BODY and a["section"] not in _SKIP_CATEGORIES
            and not _SKIP_TITLE.search(html.unescape(a["title"] or "")))


_CHOOSE_SYSTEM = """당신은 서울경제 AI PRISM 영어 영상의 편집자다. 신문 한 면의 기사 목록을 받는다.
1번은 그 면의 TOP 기사로 이미 정해져 있다. 나머지 중에서 TOP 기사와 함께 영상에 다룰 기사 1개를 고른다.
기준: 해외 독자에게 의미 있는 경제·산업·시장 뉴스, 구체적인 수치가 있는 기사, TOP 기사와 같은 사실을 반복하지 않는 기사.
답은 JSON 하나만: {"pick": 번호, "reason": "한 문장"}"""


def bedrock_chooser(profile: str | None = None) -> Callable[[str, str], str]:
    import boto3

    session = boto3.Session(profile_name=profile, region_name="us-east-1") if profile else boto3.Session(region_name="us-east-1")
    client = session.client("bedrock-runtime")

    def call(system: str, user: str) -> str:
        res = client.converse(
            modelId=MODEL_ID, system=[{"text": system}],
            messages=[{"role": "user", "content": [{"text": user}]}],
            # Haiku 5.5는 temperature를 받지 않는다. 300토큰이면 답이 비거나 중간에 끊겼다(2026-11-18 시험) — 넉넉히 둔다.
            inferenceConfig={"maxTokens": 4000},
        )
        return "".join(c.get("text", "") for c in res["output"]["message"]["content"])

    return call


def choose_second(top: dict, others: list[dict], call: Callable[[str, str], str] | None) -> tuple[dict, str]:
    """TOP과 같이 다룰 기사 1개 → (기사, 고른 이유). AI가 실패하면 가장 긴 기사."""
    longest = max(others, key=lambda a: a["content_len"])
    if len(others) == 1 or call is None:
        return (others[0] if len(others) == 1 else longest), "후보 1개" if len(others) == 1 else "AI 없음 — 가장 긴 기사"
    lines = []
    for i, a in enumerate([top, *others], 1):
        body = re.sub(r"\s+", " ", a["content"] or "")[:300]
        lines.append(f"{i}. {'[TOP] ' if i == 1 else ''}{html.unescape(a['title'])}\n   {body}")
    try:
        raw = call(_CHOOSE_SYSTEM, "\n\n".join(lines))
        m = re.search(r"\{.*\}", raw, re.S)
        got = json.loads(m.group(0)) if m else {}
        pick = int(got.get("pick", 0))
        if 2 <= pick <= len(others) + 1:
            return others[pick - 2], str(got.get("reason", ""))[:200]
        print(f"[prism-paper] AI 답 번호 이상({raw[:100]!r}) — 가장 긴 기사")
    except Exception as e:  # noqa: BLE001 — 고르기 실패가 제작을 막으면 안 된다
        print(f"[prism-paper] AI 고르기 실패({e!r}) — 가장 긴 기사")
    return longest, "AI 실패 — 가장 긴 기사"


def collect(day: dt.date, profile: str | None = None, call: Callable[[str, str], str] | None = None) -> list[dict]:
    """지면 날짜 day → 그룹마다 {type, label, file_name, recording_date, page, text, keys, titles, reason} 또는
    {type, label, skipped: 이유}. 일요일은 신문이 없다."""
    pages, items = paper_pages(day, profile)
    results = []
    for type_code, label, section in SECTIONS:
        base = {"type": type_code, "label": label}
        page = section_page(pages, section)
        if page is None:
            results.append({**base, "skipped": "섹션 첫 면을 찾지 못함"})
            continue
        arts = [a for a in pages[page] if _usable(a)]
        top = next((a for a in arts if a["paper_paragraph"] == "TOP"), None)
        others = [a for a in arts if a is not top]
        if top is None or not others:
            results.append({**base, "page": page, "skipped": f"{page}면에 쓸 기사가 2개 미만"})
            continue
        second, reason = choose_second(top, others, call)
        chosen = [top, second]
        text = f"\n\n{prism_auto._SEPARATOR}\n".join(
            prism_auto._article_block(items[a["key"]]).rstrip("\n") for a in chosen
        ) + f"\n\n{prism_auto._SEPARATOR}"
        results.append({
            **base, "page": page, "file_name": f"{day:%m%d}_{label}.txt", "recording_date": day.isoformat(),
            "text": text, "keys": [a["key"] for a in chosen],
            "titles": [html.unescape(a["title"]) for a in chosen], "reason": reason,
        })
    return results


def main() -> None:
    parser = argparse.ArgumentParser(description="그날 신문 지면 → PRISM 지면 영상(PG1~PG4) 기사 txt")
    parser.add_argument("--date", required=True, help="지면 날짜 YYYYMMDD(= 영상 날짜)")
    parser.add_argument("--out", required=True)
    parser.add_argument("--profile", default=None)
    parser.add_argument("--no-ai", action="store_true", help="두 번째 기사를 AI 대신 가장 긴 기사로")
    args = parser.parse_args()
    day = dt.datetime.strptime(args.date, "%Y%m%d").date()
    out = Path(args.out)
    out.mkdir(parents=True, exist_ok=True)
    call = None if args.no_ai else bedrock_chooser(args.profile)
    for r in collect(day, args.profile, call):
        if r.get("skipped"):
            print(f"  {r['type']} {r['label']}: 건너뜀 — {r['skipped']}")
            continue
        (out / r["file_name"]).write_text(r["text"], encoding="utf-8")
        print(f"  {r['type']} {r['label']} {r['page']}면 → {r['file_name']}")
        for k, t in zip(r["keys"], r["titles"]):
            print(f"      {k} {t}")
        print(f"      고른 이유: {r['reason']}")


if __name__ == "__main__":
    main()
