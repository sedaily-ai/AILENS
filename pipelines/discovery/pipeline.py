"""discovery 파이프라인 — 서울경제 일일 기사 XML에서 "지면 특별 코너"
(전체/증권/산업/시그널) 후보를 뽑아 분류만 해준다.

다른 pipelines/*와 같은 원칙: **생성(여기서는 "분류")까지만, 발행은
범위 밖**이다 — S3 업로드도 DDB write도 하지 않는다. 결과를 로컬
JSON으로 저장해서 사람이 훑어보고, 그중 실제로 4포맷 콘텐츠로 만들
기사를 고르면 그 뒤는 기존 절차(pipelines/letters 등 + 발행
스크립트)를 그대로 따른다.

읽는 데이터: `s3://sedaily-news-xml-storage/daily-xml/YYYYMMDD.xml`
— `service/backend/clients/s3_xml_client.py`가 이미 쓰는 것과 같은
버킷·키 패턴(실제 다운로드해서 구조 확인 후 작성, 2026-08-21). 그
클라이언트를 그대로 import하지 않고 가볍게 새로 파싱하는 이유는
`pipelines/`가 `service/backend`에 의존하지 않는 독립 스크립트
모음이라는 기존 원칙(pipelines/README.md)을 따르기 위함 — 이 파일이
쓰는 필드(title/subTitle/category/content/image/url/date/time)만
필요하고 S3Article의 나머지(관련기사·레버리지·푸시 등)는 안 씀.

분류 기준(2026-08-21, 실제 XML 확인 후 작성 — 1차 버전은 "전체"를
길이·사진·카테고리 규칙으로 추정하려 했으나 67건까지 걸러져도 "톱기사
후보"라 하기엔 너무 헐거웠다. 사용자가 "paper 태그에 1면 있는게 지면
1면"이라고 정정 — 그대로 확인해보니 XML에 실제 지면(인쇄판) 배치
정보(`<paper><editingInfo><paperNumber>`)가 있고, 전날치(2026-08-20)
완결된 XML에서 `paperNumber == '1'`인 기사가 정확히 이 세션 앞부분에서
사용자가 직접 고른 4건(호남반도체·가계대출·GV90·트럼프北핵)과
일치했다 — 규칙이 아니라 실제 편집 데이터였다):
  - "시그널": XML의 최상위 category가 정확히 "Signal"인 기사 —
    실제로 제목에 "[시그널]"이 그대로 박혀 있어 원래 서울경제 자체
    코너와 그대로 일치한다.
  - "증권"/"산업": XML의 최상위 category가 그대로 "증권"/"산업".
  - "전체"(지면 1면): `<paper><editingInfo><paperNumber>`가 정확히
    "1"인 기사 — 실제 인쇄판 1면에 배치된 기사 그대로다(추정 아님).
    `<paper>` 태그 자체가 지면 배치가 확정된 기사에만 붙는다 — 그날
    아직 지면 편집이 안 끝났으면(예: 오늘 자정 전 이른 시간) 후보가
    0건일 수 있다(정상 — 다음 날 아침에 다시 확인).
"""
import argparse
import html
import json
import re
import xml.etree.ElementTree as ET
from pathlib import Path

import boto3

BUCKET = "sedaily-news-xml-storage"
PREFIX = "daily-xml"

_TAG_RE = re.compile(r"<[^>]+>")


def _strip_html(raw: str) -> str:
    text = _TAG_RE.sub("", raw or "")
    return html.unescape(text).strip()


def fetch_articles(date: str, profile: str | None = None) -> list[dict]:
    """date는 YYYYMMDD. S3에서 XML을 받아 필요한 필드만 dict로 뽑는다."""
    session = boto3.Session(profile_name=profile) if profile else boto3.Session()
    s3 = session.client("s3", region_name="us-east-1")
    key = f"{PREFIX}/{date}.xml"
    print(f"[discovery] s3://{BUCKET}/{key} 다운로드 중...")
    raw = s3.get_object(Bucket=BUCKET, Key=key)["Body"].read()
    root = ET.fromstring(raw)

    articles = []
    for item in root:
        title_el = item.find("title")
        if title_el is None or not (title_el.text or "").strip():
            continue
        cats = item.findall("category")
        top_category = cats[0].attrib.get("name", "").split(",")[0] if cats else ""
        content_el = item.find("content")
        content_text = _strip_html(content_el.text or "") if content_el is not None else ""
        image_el = item.find("image")
        url_el = item.find("url")
        sub_title_el = item.find("subTitle")
        paper_el = item.find("paper")
        paper_number = None
        paper_paragraph = None
        if paper_el is not None:
            edit_info = paper_el.find("editingInfo")
            if edit_info is not None:
                paper_number = (edit_info.findtext("paperNumber", "") or "").strip() or None
                paper_paragraph = (edit_info.findtext("paragraph", "") or "").strip() or None

        articles.append({
            "nsid": (item.find("nsid").text or "").strip() if item.find("nsid") is not None else "",
            "title": title_el.text.strip(),
            "sub_title": _strip_html(sub_title_el.text or "") if sub_title_el is not None else "",
            "top_category": top_category,
            "content_len": len(content_text),
            "has_photo": image_el is not None,
            "photo_url": image_el.attrib.get("href") if image_el is not None else None,
            "url": url_el.attrib.get("href") if url_el is not None else None,
            "date": (item.find("date").text or "").strip() if item.find("date") is not None else "",
            "time": (item.find("time").text or "").strip() if item.find("time") is not None else "",
            # 실제 인쇄판 지면 배치 — "1"이면 지면 1면. paragraph "TOP"이면
            # 그 지면 안에서도 톱기사(위쪽 배치)라는 뜻이라 1면 중에서도
            # 우선순위를 매길 때 참고할 수 있다.
            "paper_number": paper_number,
            "paper_paragraph": paper_paragraph,
        })
    print(f"[discovery] 기사 {len(articles)}건 파싱 완료")
    return articles


def classify(articles: list[dict]) -> dict[str, list[dict]]:
    buckets: dict[str, list[dict]] = {"전체": [], "증권": [], "산업": [], "시그널": []}
    for a in articles:
        if a["top_category"] == "Signal":
            buckets["시그널"].append(a)
        elif a["top_category"] == "증권":
            buckets["증권"].append(a)
        elif a["top_category"] == "산업":
            buckets["산업"].append(a)
        if a["paper_number"] == "1":
            buckets["전체"].append(a)
    # 지면 1면 안에서도 그 지면의 TOP(위쪽 배치) 기사를 먼저 보여준다 —
    # 편집 데이터 그대로라 순서 자체가 의미 있다(추정 랭킹이 아님).
    buckets["전체"].sort(key=lambda a: 0 if a["paper_paragraph"] == "TOP" else 1)
    return buckets


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="일일 기사 XML을 지면 특별 코너 후보로 분류")
    parser.add_argument("date", help="YYYYMMDD")
    parser.add_argument("--profile", default="yeonggwang")
    parser.add_argument("--output", default=None, help="결과 JSON 저장 경로(기본: output/<date>.json)")
    args = parser.parse_args()

    articles = fetch_articles(args.date, profile=args.profile)
    buckets = classify(articles)

    for name, items in buckets.items():
        print(f"[discovery] {name}: {len(items)}건")
        for a in items[:8]:
            paper_tag = f"{a['paper_paragraph']}@{a['paper_number']}면" if a["paper_number"] else ""
            print(f"    - {a['title']} ({a['top_category']}, {a['content_len']}자{', ' + paper_tag if paper_tag else ''})")
    if not buckets["전체"]:
        print("[discovery] 전체(지면 1면) 0건 — 그날 지면 편집이 아직 안 끝났을 수 있음(정상, 다음날 재확인)")

    out_path = Path(args.output) if args.output else Path("output") / f"{args.date}.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(buckets, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[discovery] 저장 완료 — {out_path}")
