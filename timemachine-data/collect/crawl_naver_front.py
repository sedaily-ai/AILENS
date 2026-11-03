#!/usr/bin/env python3
"""네이버 서울경제(oid=011) 신문보기 1면 기사 수집.

사용: python3 collect/crawl_naver_front.py 2026-01-01 2026-11-03 [출력.csv]
- 출력 CSV 는 저장소에 넣지 않는다(README 참조). 기본 파일명 naver_front_{시작연도}.csv
- 서버 렌더링 HTML만 파싱(표준 라이브러리). 요청 간 0.7초 대기.
- 지면이 없는 날(일요일·휴간)은 건너뜀. 이미 수집된 날짜는 재요청하지 않음(이어받기).
"""
import csv, html, re, sys, time, urllib.request
from datetime import date, timedelta
from pathlib import Path

PRESS = "011"
URL = "https://media.naver.com/press/{}/newspaper?date={}"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/124 Safari/537.36"
FIELDS = ["date", "page", "rank", "is_top", "article_id", "title", "url", "thumbnail"]


def fetch(d: date) -> str:
    req = urllib.request.Request(URL.format(PRESS, d.strftime("%Y%m%d")), headers={"User-Agent": UA})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                return r.read().decode("utf-8")
        except Exception:
            time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"fetch 실패: {d}")


def parse_page1(src: str, d: date):
    """1면 블록의 기사 목록 반환. 1면이 없으면 빈 리스트."""
    m = re.search(r'<span class="page_notation"><em>1</em>면', src)
    if not m:
        return []
    end = src.find("newspaper_brick_item", m.end())
    block = src[m.end(): end if end != -1 else len(src)]
    rows = []
    for rank, li in enumerate(re.findall(r"<li>(.*?)</li>", block, re.S), 1):
        href = re.search(r'href="([^"]+)"', li)
        title = re.search(r"<strong>(.*?)</strong>", li, re.S)
        img = re.search(r'<img src="([^"]+)"', li)
        if not (href and title):
            continue
        url = html.unescape(href.group(1))
        aid = re.search(r"/(\d{10})\b", url)
        rows.append({
            "date": d.isoformat(), "page": 1, "rank": rank,
            "is_top": 1 if img else 0,  # 썸네일이 붙은 기사 = 1면 톱
            "article_id": aid.group(1) if aid else "",
            "title": html.unescape(title.group(1)).strip(),
            "url": url,
            "thumbnail": html.unescape(img.group(1)) if img else "",
        })
    return rows


def main():
    start, end = (date.fromisoformat(x) for x in sys.argv[1:3])
    out = Path(sys.argv[3] if len(sys.argv) > 3 else f"naver_front_{start.year}.csv")
    done = set()
    if out.exists():
        with out.open(encoding="utf-8-sig") as f:
            done = {r["date"] for r in csv.DictReader(f)}
    new_file = not out.exists()
    skipped, got = [], 0
    with out.open("a", newline="", encoding="utf-8-sig") as f:
        w = csv.DictWriter(f, FIELDS)
        if new_file:
            w.writeheader()
        d = start
        while d <= end:
            if d.isoformat() not in done:
                rows = parse_page1(fetch(d), d)
                if rows:
                    w.writerows(rows); f.flush(); got += 1
                else:
                    skipped.append(d.isoformat())
                time.sleep(0.7)
            d += timedelta(days=1)
    print(f"수집 일수 {got}, 지면 없음 {len(skipped)}일 -> {out}")
    if skipped:
        print("지면 없음:", ", ".join(skipped))


if __name__ == "__main__":
    main()
