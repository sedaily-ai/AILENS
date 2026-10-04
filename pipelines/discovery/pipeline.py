"""discovery 파이프라인 — 서울경제 일일 기사 XML에서 지면 특별 코너
(전체/증권/산업/시그널) 후보를 분류해 로컬 JSON으로 저장한다.

분류까지만 수행하며 S3 업로드와 DDB write는 하지 않는다. 입력은
`s3://sedaily-news-xml-storage/daily-xml/YYYYMMDD.xml`이다
(service/backend/clients/s3_xml_client.py와 같은 버킷·키 패턴). pipelines/가
service/backend에 의존하지 않도록 파싱 로직을 별도로 둔다.

분류 기준
  - 시그널: category 태그 중 하나라도 "Signal"이거나 제목에 "마켓시그널"/
    "[시그널]"이 있는 기사. top_category만 보면 누락이 많다(`_is_market_signal()` 참조).
  - 증권/산업: 시그널이 아니면서 최상위 category가 "증권"/"산업"인 기사.
  - 전체(지면 1면): `<paper><editingInfo><paperNumber>`가 "1"이고
    `<paper><publishInfo><date>`가 지면 날짜와 일치하는 기사. 신문은 전날
    저녁 마감이라 웹 게재일과 지면 발행일이 다르므로, 지면 날짜 D와 D-1
    두 파일을 함께 탐색한다.
"""
import argparse
import html
import json
import re
import xml.etree.ElementTree as ET
from datetime import datetime, timedelta
from pathlib import Path

import os

import boto3

BUCKET = "sedaily-news-xml-storage"
PREFIX = "daily-xml"

_TAG_RE = re.compile(r"<[^>]+>")
_WHITESPACE_RE = re.compile(r"\s+")


def _strip_html(raw: str) -> str:
    # 태그를 공백으로 치환해 <br/> 등 구분자 자리의 앞뒤 단어가 붙지 않게 한다.
    # sub_title이 이 함수를 거쳐 저장되고 cms_posts_shaping의 context로 쓰인다.
    text = _TAG_RE.sub(" ", raw or "")
    text = html.unescape(text)
    return _WHITESPACE_RE.sub(" ", text).strip()


def _is_market_signal(title: str, categories: list[str]) -> bool:
    """"마켓시그널" 코너 판정. top_category(XML 첫 카테고리 태그)만 보면
    누락이 많아(10일 표본 58건 중 약 40%) category 태그 전체 목록과 제목
    표시("마켓시그널"/"[시그널]")를 함께 본다."""
    if any((c or "").split(",")[0] == "Signal" for c in categories):
        return True
    title = title or ""
    return "마켓시그널" in title or "[시그널" in title


def _s3_client(profile: str | None):
    session = boto3.Session(profile_name=profile) if profile else boto3.Session()
    # discovery/는 common/에 의존하지 않는 독립 단계이므로 config.py 대신
    # 같은 환경변수 패턴을 직접 쓴다.
    return session.client("s3", region_name=os.environ.get("AWS_REGION", "us-east-1"))


def _download_root(s3, date: str) -> ET.Element | None:
    key = f"{PREFIX}/{date}.xml"
    try:
        raw = s3.get_object(Bucket=BUCKET, Key=key)["Body"].read()
    except s3.exceptions.NoSuchKey:
        return None
    return ET.fromstring(raw)


def _parse_item(item: ET.Element) -> dict | None:
    title_el = item.find("title")
    if title_el is None or not (title_el.text or "").strip():
        return None
    cats = item.findall("category")
    top_category = cats[0].attrib.get("name", "").split(",")[0] if cats else ""
    # 기사 하나에 category 태그가 여러 개 붙는 경우가 흔해 top_category(첫 태그의
    # 최상위 세그먼트)는 지면특별코너 선정용으로만 쓴다. 표시용 카테고리는
    # 전체 태그 문자열을 그대로 넘기고 display_category()가 하위 세그먼트까지
    # 검사한다("재테크"는 최상위가 아니라 하위 세그먼트로만 존재).
    categories = [c.attrib.get("name", "") for c in cats]
    is_market_signal = _is_market_signal(title_el.text.strip(), categories)
    content_el = item.find("content")
    content_text = _strip_html(content_el.text or "") if content_el is not None else ""
    image_el = item.find("image")
    url_el = item.find("url")
    sub_title_el = item.find("subTitle")
    paper_el = item.find("paper")
    paper_number = None
    paper_paragraph = None
    paper_publish_date = None
    if paper_el is not None:
        edit_info = paper_el.find("editingInfo")
        pub_info = paper_el.find("publishInfo")
        if edit_info is not None:
            paper_number = (edit_info.findtext("paperNumber", "") or "").strip() or None
            paper_paragraph = (edit_info.findtext("paragraph", "") or "").strip() or None
        if pub_info is not None:
            paper_publish_date = (pub_info.findtext("date", "") or "").strip() or None

    return {
        "nsid": (item.find("nsid").text or "").strip() if item.find("nsid") is not None else "",
        # `key`는 sedaily.com/article/{key}의 공개 기사 번호로 nsid와 다르다.
        # `url`에는 `?ref=` 같은 쿼리스트링이 붙어 중복 방지 비교에 쓸 수 없다.
        "key": (item.find("key").text or "").strip() if item.find("key") is not None else "",
        "title": title_el.text.strip(),
        "sub_title": _strip_html(sub_title_el.text or "") if sub_title_el is not None else "",
        "top_category": top_category,
        "categories": categories,
        "is_market_signal": is_market_signal,
        # 후속 4포맷 파이프라인에 그대로 넘길 원문.
        "content": content_text,
        "content_len": len(content_text),
        "has_photo": image_el is not None,
        "photo_url": image_el.attrib.get("href") if image_el is not None else None,
        # 영상 photo 컷이 캡션을 참고할 수 있게 함께 담는다(s3_xml_client._parse_image()와
        # 같은 속성명). 둘 다 비면 None.
        "photo_caption": (
            (image_el.attrib.get("caption_title", "") + " " + image_el.attrib.get("caption_content", "")).strip()
            if image_el is not None else None
        ) or None,
        "url": url_el.attrib.get("href") if url_el is not None else None,
        "date": (item.find("date").text or "").strip() if item.find("date") is not None else "",
        "time": (item.find("time").text or "").strip() if item.find("time") is not None else "",
        # 실제 인쇄판 지면 배치. paper_publish_date는 "이 기사가 실릴 지면의
        # 발행일"(웹 게재일과 다를 수 있음 — 전날 저녁 게재 → 다음날 지면).
        "paper_number": paper_number,
        "paper_paragraph": paper_paragraph,
        "paper_publish_date": paper_publish_date,
    }


def fetch_articles(date: str, profile: str | None = None) -> list[dict]:
    """date는 YYYYMMDD(웹 게재일 기준 daily-xml 파일 날짜).
    증권/산업/시그널처럼 "오늘 웹에 올라온 카테고리 기사"를 찾을 때 쓴다."""
    s3 = _s3_client(profile)
    print(f"[discovery] s3://{BUCKET}/{PREFIX}/{date}.xml 다운로드 중...")
    root = _download_root(s3, date)
    if root is None:
        print(f"[discovery] {date}.xml 없음")
        return []
    articles = [a for item in root if (a := _parse_item(item)) is not None]
    print(f"[discovery] 기사 {len(articles)}건 파싱 완료")
    return articles


def fetch_front_page(print_date: str, profile: str | None = None) -> list[dict]:
    """print_date(YYYYMMDD)는 "지면 날짜"(신문에 찍힌 날짜) — 신문은 전날
    저녁 마감이라, 그 지면에 실린 기사 대부분은 print_date-1의 daily-xml에
    웹 게재돼 있다. print_date 당일 파일도 혹시 모를 당일 수정분 대비로
    같이 훑는다. `paper/publishInfo/date == print_date` & `paperNumber=='1'`
    인 기사만 남긴다."""
    s3 = _s3_client(profile)
    prev_date = (datetime.strptime(print_date, "%Y%m%d") - timedelta(days=1)).strftime("%Y%m%d")

    front_page: list[dict] = []
    seen_nsid: set[str] = set()
    for d in (prev_date, print_date):
        print(f"[discovery] s3://{BUCKET}/{PREFIX}/{d}.xml 다운로드 중... (지면 {print_date} 후보 탐색)")
        root = _download_root(s3, d)
        if root is None:
            print(f"[discovery] {d}.xml 없음")
            continue
        for item in root:
            a = _parse_item(item)
            if a is None or a["nsid"] in seen_nsid:
                continue
            if a["paper_publish_date"] == print_date and a["paper_number"] == "1":
                front_page.append(a)
                seen_nsid.add(a["nsid"])

    # 지면 1면 안에서도 그 지면의 TOP(위쪽 배치) 기사를 먼저 보여준다 —
    # 편집 데이터 그대로라 순서 자체가 의미 있다(추정 랭킹이 아님).
    front_page.sort(key=lambda a: 0 if a["paper_paragraph"] == "TOP" else 1)
    return front_page


def classify(date: str, profile: str | None = None) -> dict[str, list[dict]]:
    buckets: dict[str, list[dict]] = {"전체": [], "증권": [], "산업": [], "시그널": []}
    for a in fetch_articles(date, profile=profile):
        if a["is_market_signal"]:
            buckets["시그널"].append(a)
        elif a["top_category"] == "증권":
            buckets["증권"].append(a)
        elif a["top_category"] == "산업":
            buckets["산업"].append(a)
    buckets["전체"] = fetch_front_page(date, profile=profile)
    return buckets


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="일일 기사 XML을 지면 특별 코너 후보로 분류")
    parser.add_argument("date", help="YYYYMMDD — '오늘'(증권/산업/시그널은 이 날짜 웹 게재분, 전체는 이 날짜 지면 1면)")
    parser.add_argument("--profile", default="yeonggwang")
    parser.add_argument("--output", default=None, help="결과 JSON 저장 경로(기본: output/<date>.json)")
    args = parser.parse_args()

    buckets = classify(args.date, profile=args.profile)

    for name, items in buckets.items():
        print(f"[discovery] {name}: {len(items)}건")
        for a in items[:8]:
            paper_tag = f"{a['paper_paragraph']}@{a['paper_number']}면" if a["paper_number"] else ""
            print(f"    - {a['title']} ({a['top_category']}, {a['content_len']}자{', ' + paper_tag if paper_tag else ''})")
    if not buckets["전체"]:
        print("[discovery] 전체(지면 1면) 0건 — 그 지면 편집이 아직 안 끝났을 수 있음(정상, 다음날 아침에 재확인)")

    out_path = Path(args.output) if args.output else Path("output") / f"{args.date}.json"
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(buckets, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"[discovery] 저장 완료 — {out_path}")
