#!/usr/bin/env python3
"""타임라인 연대기의 "관심도" 곡선용 월별 기사 수 수집 — 빅카인즈(서울경제)에서 키워드별 월간 total_hits를 센다.

결과: docs/product/time-machine-events/attention.json
  { "months": ["1990-01", ...], "total": [월별 전체 기사 수], "keywords": { "IMF": [월별 수], ... }, "collectedAt": "..." }
- 월별 값은 서울경제 기사 중 그 달에 키워드가 들어간 기사 수(total_hits). total은 빈 검색어의 기사 수.
- 아카이브 적재량이 달마다 다르므로(예: 1998-01~08은 거의 비어 있음) 화면은 키워드 수 ÷ total(비중)로 그린다.
실행: AWS_PROFILE=… AWS_DEFAULT_REGION=us-east-1 python3 scripts/build_timeline_attention.py
키는 SSM에서만 읽고 출력하지 않는다. 호출 수는 (키워드+1) × 월 수 ≈ 2,600회, 동시 3개, 요청당 0.4초 안팎.
"""
import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, date

import requests

sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..'))
from common.secrets import get_secret  # noqa: E402

KEYWORDS = ['IMF', '금리', '환율', '부동산', '주가']
START = (1990, 1)
END = (2026, 9)  # 2026-09까지(진행 중인 달 포함)
OUT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..', 'docs', 'product', 'time-machine-events', 'attention.json'))
URL = 'https://tools.kinds.or.kr/search/news'


def months():
    y, m = START
    while (y, m) <= END:
        yield y, m
        m += 1
        if m == 13:
            y, m = y + 1, 1


def month_range(y, m):
    a = date(y, m, 1)
    b = date(y + (m == 12), (m % 12) + 1, 1)
    return a.isoformat(), b.isoformat()


def hits(key, q, y, m, retries=4):
    a, b = month_range(y, m)
    payload = {'access_key': key, 'argument': {'query': q, 'published_at': {'from': a, 'until': b}, 'provider': ['서울경제'],
               'sort': {'date': 'desc'}, 'return_from': 0, 'return_size': 1, 'fields': ['title']}}
    for i in range(retries):
        try:
            r = requests.post(URL, json=payload, timeout=40).json()
            if r.get('result') == 0:
                return int((r.get('return_object') or {}).get('total_hits') or 0)
        except Exception:
            pass
        time.sleep(1.5 * (i + 1))
    return None


def main():
    key = get_secret('/sedaily-mbti/bigkinds-api-key')
    ms = list(months())
    jobs = [('', y, m) for y, m in ms] + [(k, y, m) for k in KEYWORDS for y, m in ms]
    results = {}
    t0 = time.time()
    with ThreadPoolExecutor(3) as ex:
        futs = {ex.submit(hits, key, q, y, m): (q, y, m) for q, y, m in jobs}
        done = 0
        for f, k in futs.items():
            results[k] = f.result()
            done += 1
            if done % 200 == 0:
                print(f'{done}/{len(jobs)} {time.time() - t0:.0f}s', flush=True)
    failed = [k for k, v in results.items() if v is None]
    out = {
        'months': [f'{y}-{m:02d}' for y, m in ms],
        'total': [results[('', y, m)] for y, m in ms],
        'keywords': {k: [results[(k, y, m)] for y, m in ms] for k in KEYWORDS},
        'collectedAt': datetime.now().astimezone().isoformat(timespec='seconds'),
        'source': '빅카인즈 뉴스 검색 total_hits, provider=서울경제',
        'failed': len(failed),
    }
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False)
    print(f'saved {OUT} (실패 {len(failed)}건)')


if __name__ == '__main__':
    main()
