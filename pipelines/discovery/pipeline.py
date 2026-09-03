"""discovery 파이프라인 — 서울경제 일일 기사 XML에서 "지면 특별 코너"
(전체/증권/산업/시그널) 후보를 뽑아 분류만 해준다.

다른 pipelines/*와 같은 원칙: **생성(여기서는 "분류")까지만, 발행은
범위 밖**이다 — S3 업로드도 DDB write도 하지 않는다. 결과를 로컬
JSON으로 저장해서 사람이 훑어보고, 그중 실제로 4포맷 콘텐츠로 만들
기사를 고르면 그 뒤는 기존 절차(pipelines/letters 등 + 발행
스크립트)를 그대로 따른다.

읽는 데이터: `s3://sedaily-news-xml-storage/daily-xml/YYYYMMDD.xml`
— `service/backend/clients/s3_xml_client.py`가 이미 쓰는 것과 같은
버킷·키 패턴. 그 클라이언트를 그대로 import하지 않고 가볍게 새로
파싱하는 이유는 `pipelines/`가 `service/backend`에 의존하지 않는
독립 스크립트 모음이라는 기존 원칙(pipelines/README.md)을 따르기
위함.

분류 기준(2026-08-21, 실제 XML 확인 후 두 번 수정):
  - "시그널": XML의 최상위 category가 정확히 "Signal"인 기사 —
    제목에 이미 "[시그널]"이 그대로 박혀 있어 서울경제 자체 코너와
    그대로 일치한다. **그날 daily-xml 파일**(웹 게재일 기준) 안에서 찾는다.
  - "증권"/"산업": 같은 파일 안에서 최상위 category가 그대로
    "증권"/"산업"인 기사.
  - "전체"(지면 1면): `<paper><editingInfo><paperNumber>`가 "1"인
    기사 — 실제 인쇄판 1면에 배치된 기사 그대로다(추정 아님).
    **다만 이건 daily-xml 파일 날짜와 다른 기준이 필요하다** — 처음엔
    "그날 파일 안에서 paperNumber=='1' 찾기"로 만들었는데, 실제
    구조를 다시 보니 신문은 전날 저녁 마감이라 어제 웹에 게재된
    기사가 오늘 아침 지면 1면에 실린다. `<paper><publishInfo><date>`
    필드가 "이 기사가 실릴 지면의 실제 발행일"을 따로 갖고 있어서
    (예: 8/20 게재 기사인데 publishInfo/date는 20260821), daily-xml
    파일 자체의 날짜가 아니라 이 필드로 걸러야 한다. 검증: 2026-08-20
    daily-xml에서 publishInfo/date=="20260821" & paperNumber=="1"인
    기사 5건이, 이 세션에서 사용자가 실제로 골랐던 4건(호남반도체·
    가계대출·GV90·트럼프北핵)과 정확히 일치했다. 그래서 "전체"는
    지면 날짜(D) 기준으로 D와 D-1(전날, 대부분 여기서 나옴) 두 파일을
    같이 훑는다.
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
    # 2026-09-03 — 태그를 빈 문자열로 지웠더니 원문의 <br/>(부제 줄바꿈 등)
    # 자리에 아무 구분자도 안 남아 앞뒤 문장이 그대로 붙어버렸다("...수요
    # 확보<br/>하이닉스 자금..." → "...수요 확보하이닉스 자금...").
    # 메타디스크립션 감사에서 lens/video/letters 세 채널 전부의 context가
    # 이 형태로 깨져 있는 걸 발견 — sub_title이 이 함수를 거쳐 저장되고
    # service/backend/services/cms_posts_shaping.py:220의 context가 그
    # sub_title을 그대로 쓴다. 태그를 공백으로 바꾸고 공백을 하나로
    # 접으면 어떤 태그가 구분자였든 최소한 단어가 붙는 사고는 안 난다.
    text = _TAG_RE.sub(" ", raw or "")
    text = html.unescape(text)
    return _WHITESPACE_RE.sub(" ", text).strip()


def _s3_client(profile: str | None):
    session = boto3.Session(profile_name=profile) if profile else boto3.Session()
    # discovery/는 common/의 어느 것도 안 쓰는 게 문서화된 설계(admin
    # 프롬프트·Bedrock을 안 건드리는 사전 생성 단계) — common/config.py를
    # 새로 의존하는 대신 같은 os.environ.get 패턴만 여기서 직접 씀
    # (2026-08-23 코드 리팩토링 감사).
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
    # 기사 하나에 category 태그가 여러 개 붙는 경우가 흔하다(예: 삼성전자
    # 주주환원 기사가 "경제,사회,금융,증권,산업,국제" 6개를 동시에 달고
    # 있는데 top_category는 그중 XML에 가장 먼저 나온 "경제" 하나만 본다).
    # 2026-08-23 — mustknow_auto/frontpage_auto가 category(사이트 6개
    # 경제 카테고리 라벨) 표시에 top_category만 쓰다 보니, 실제로는
    # "증권"·"산업" 태그를 갖고 있는 기사인데도 첫 태그가 "경제"/"정치"
    # 라서 카테고리 없이 발행되는 버그를 발견(사용자가 /archive에서
    # "4가지 시선"이라는 가짜 카테고리로 뜨는 걸 지적). top_category는
    # 지면특별코너 4탭 선정(증권/산업/시그널 매칭)이 이미 이 값 기준으로
    # 검증된 로직이라 그대로 두고, 표시용으로만 전체 카테고리 태그를
    # 별도 필드에 담아 호출부가 그중 사이트 카테고리와 일치하는 걸
    # 골라 쓰게 한다.
    categories = [c.attrib.get("name", "").split(",")[0] for c in cats]
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
        # `key`는 sedaily.com/article/{key} URL에 그대로 쓰이는 공개
        # 기사 번호(nsid와 다름 — nsid는 내부 영숫자 코드). 발행 후
        # 중복 방지 체크는 이 값으로 해야 한다 — `url`에는 종종
        # `?ref=sedailyEng` 같은 쿼리스트링이 붙어서 문자열 완전일치로
        # 비교하면 같은 기사인데도 다르다고 잘못 판단한다.
        "key": (item.find("key").text or "").strip() if item.find("key") is not None else "",
        "title": title_el.text.strip(),
        "sub_title": _strip_html(sub_title_el.text or "") if sub_title_el is not None else "",
        "top_category": top_category,
        "categories": categories,
        # 4포맷 파이프라인(letters 등)에 그대로 넘길 원문 — discovery는
        # "분류"만 한다는 원칙은 유지하되, 후속 자동 발행 단계가 다시
        # 원문을 가져올 필요 없도록 여기서 한 번에 담아둔다.
        "content": content_text,
        "content_len": len(content_text),
        "has_photo": image_el is not None,
        "photo_url": image_el.attrib.get("href") if image_el is not None else None,
        # 영상 포맷의 photo 컷(2026-09-03, 기자 피드백 "원문 사진이 들어가면
        # 좋겠다")이 캡션까지 참고할 수 있도록 같이 담아둔다 — clients/
        # s3_xml_client.py의 _parse_image()와 같은 속성명(caption_title/
        # caption_content). 둘 다 비어있을 수 있어 빈 문자열로 폴백.
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
        if a["top_category"] == "Signal":
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
