#!/usr/bin/env python3
"""SSR 구조 지문 — 리팩토링 전후로 같은 주소의 HTML 구조가 달라졌는지 비교한다(행동 보존 점검).

데이터는 계속 바뀌므로(새 기사, 오늘 날짜) 글자는 버리고 태그와 class 순서만 지문으로 삼는다.
  python3 scripts/ssr-fingerprint.py capture <base-url> <out.json>   # 주소 목록을 받아 지문 저장
  python3 scripts/ssr-fingerprint.py diff <before.json> <after.json> # 주소별 달라진 정도 출력(차이가 있으면 종료 코드 1)
"""
import hashlib
import json
import re
import sys
import urllib.parse
import urllib.request
from html.parser import HTMLParser

PATHS = [
    '/', '/lens', '/lens/page/2', '/markets', '/signal', '/property', '/industry', '/finance', '/international', '/culture',
    '/markets/page/2', '/paper/2026-10-02', '/words', '/games', '/timeline', '/timeline/2026-10-02', '/timeline/1999-11-17',
    '/timeline/era/imf-1997', '/timeline/decade/1990s', '/timeline/decade/2020s', '/timeline/chronicle', '/login', '/onboarding',
    '/sitemap.xml', '/robots.txt', '/llms.txt', '/rss.xml',
]
DYNAMIC = ('/markets/', '/webtoon/', '/video/')  # 사이트맵에서 뽑는 상세 주소 접두사


class Skeleton(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tokens = []

    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style', 'svg', 'path', 'link', 'meta'):
            self.tokens.append(tag)
            return
        cls = dict(attrs).get('class', '')
        # 해시가 붙은 CSS 모듈·고유 id는 빌드마다 달라질 수 있어 숫자/해시 조각을 지운다
        cls = re.sub(r'[A-Za-z0-9_-]*[0-9a-f]{6,}[A-Za-z0-9_-]*', 'H', cls)
        self.tokens.append(f'{tag}.{cls}' if cls else tag)


def fingerprint(html: str):
    p = Skeleton()
    p.feed(html)
    joined = '|'.join(p.tokens)
    return {'tags': len(p.tokens), 'hash': hashlib.sha1(joined.encode()).hexdigest()[:12], 'bytes': len(html)}


def fetch(base, path):
    try:
        req = urllib.request.Request(base + urllib.parse.quote(path, safe="/%?=&:"), headers={'User-Agent': 'ssr-fingerprint'})
        with urllib.request.urlopen(req, timeout=60) as r:
            return r.status, r.read().decode('utf-8', 'replace')
    except urllib.error.HTTPError as e:
        return e.code, ''
    except Exception:
        return 0, ''


def capture(base, out):
    paths = list(PATHS)
    status, sm = fetch(base, '/sitemap.xml')
    for prefix in DYNAMIC:
        m = re.search(r'<loc>https?://[^/]+(' + re.escape(prefix) + r'[^<]+)</loc>', sm)
        if m:
            paths.append(m.group(1))
    result = {}

    def one(p):
        status, html = fetch(base, p)
        if p.endswith(('.xml', '.txt')):
            return {'status': status, 'bytes': len(html), 'tags': 0,
                    'hash': hashlib.sha1(re.sub(r'\d{4}-\d\d-\d\dT[\d:.+Z-]+', '', html).encode()).hexdigest()[:12]}
        return {'status': status, **fingerprint(html)}

    for p in paths:
        first, second = one(p), one(p)
        # 같은 주소를 두 번 받아 서로 다르면 데이터가 계속 바뀌는 주소라 비교에서 뺀다(unstable)
        result[p] = {**first, 'unstable': first['hash'] != second['hash']}
    json.dump(result, open(out, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    print(f'{len(result)}개 주소 지문 저장 → {out}')


def diff(a_path, b_path):
    a = json.load(open(a_path, encoding='utf-8'))
    b = json.load(open(b_path, encoding='utf-8'))
    bad = 0
    for p in sorted(set(a) | set(b)):
        x, y = a.get(p), b.get(p)
        if x is None or y is None or x.get('unstable') or y.get('unstable'):
            if x is not None and y is not None:
                continue
            print(f'  추가/삭제  {p}')
            bad += 1
        elif x['status'] != y['status']:
            print(f'  상태 변경  {p}: {x["status"]} → {y["status"]}')
            bad += 1
        elif x['hash'] != y['hash']:
            d = y['tags'] - x['tags']
            print(f'  구조 변경  {p}: 태그 {x["tags"]} → {y["tags"]} ({d:+d}), 바이트 {x["bytes"]} → {y["bytes"]}')
            bad += 1
    print('차이 없음' if bad == 0 else f'차이 {bad}건')
    return 1 if bad else 0


if __name__ == '__main__':
    if sys.argv[1] == 'capture':
        capture(sys.argv[2].rstrip('/'), sys.argv[3])
    else:
        sys.exit(diff(sys.argv[2], sys.argv[3]))
