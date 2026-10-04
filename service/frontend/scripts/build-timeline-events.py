#!/usr/bin/env python3
"""타임라인 사건 데이터 생성기 — docs/product/time-machine-events/*.json(출처 검증 원본) → src/shared/data/timelineEvents.generated.ts.

원본 JSON은 사건마다 evidence(출처·원문 인용)를 갖고, 화면용 TS에는 출처 링크만 싣는다.
status 'confirmed'(서로 독립된 출처 2개 이상이 같은 날짜)만 화면 데이터에 들어가고, 나머지는 같은 폴더 PENDING.md에 모은다.
사용: python3 scripts/build-timeline-events.py
"""
import glob
import json
import os
import re
from collections import Counter

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
SRC_DIR = os.path.join(ROOT, 'docs', 'product', 'time-machine-events')
OUT_TS = os.path.join(ROOT, 'service', 'frontend', 'src', 'shared', 'data', 'timelineEvents.generated.ts')
PENDING_MD = os.path.join(SRC_DIR, 'PENDING.md')
ATTENTION_JSON = os.path.join(SRC_DIR, 'attention.json')
ATTENTION_TS = os.path.join(ROOT, 'service', 'frontend', 'src', 'shared', 'data', 'timelineAttention.generated.ts')

# 조사 단계에서 이름이 갈린 시대를 하나로 합친다.
ERA_ALIAS = {
    '외환위기 후유증과 구조조정': 'IMF 외환위기',
    '글로벌 위기 이후 회복기': '글로벌 금융위기',
}
# 시대 페이지가 있는 시대(사건 3개 이상) — 화면 주소(slug)는 여기서만 정한다.
ERA_SLUGS = {
    'IMF 외환위기': 'imf-1997',
    '글로벌 금융위기': 'global-financial-crisis-2008',
    '금리 급등기': 'rate-surge-2022',
    '12·3 계엄과 정치 격변': 'martial-law-2024',
    '코로나 쇼크': 'covid-2020',
}
MIN_EVENTS_FOR_ERA_PAGE = 3
# 홈 "역사 속 그날" 칩에 올리는 사건(날짜) — 연대별로 대표 사건을 골랐다. 없는 날짜는 무시한다.
FEATURED_DATES = ['1993-08-12', '1997-11-21', '2008-09-15', '2020-03-19', '2024-12-03']


def load_events():
    events = []
    for path in sorted(glob.glob(os.path.join(SRC_DIR, 'events_*.json'))):
        with open(path, encoding='utf-8') as f:
            for e in json.load(f):
                e['_file'] = os.path.basename(path)
                events.append(e)
    return events


def main():
    raw = load_events()
    confirmed = [e for e in raw if e.get('status') == 'confirmed']
    pending = [e for e in raw if e.get('status') != 'confirmed']

    seen, events = set(), []
    for e in sorted(confirmed, key=lambda x: (x['date'], x['title'])):
        key = (e['date'], e['title'])
        if key in seen:
            continue
        seen.add(key)
        era = ERA_ALIAS.get(e.get('era'), e.get('era'))
        events.append({**e, 'era': era})

    era_counts = Counter(e['era'] for e in events if e.get('era'))
    per_date = Counter()
    out = []
    for e in events:
        per_date[e['date']] += 1
        era = e.get('era')
        slug = ERA_SLUGS.get(era) if era and era_counts[era] >= MIN_EVENTS_FOR_ERA_PAGE else None
        item = {
            'id': f"{e['date']}-{per_date[e['date']]}",
            'date': e['date'],
            'title': e['title'],
            'description': e['description'],
            'keywords': e.get('searchKeywords') or [],
            'sources': [{'label': s['label'], 'url': s['url']} for s in e['evidence']],
        }
        for k in ('endDate', 'shortTitle', 'paperDate'):
            if e.get(k):
                item[k] = e[k]
        # 화면에 노출하는 메모는 사람이 독자용으로 쓴 publicNote만. 조사 단계의 note는 작업 기록이라 JSON에만 둔다.
        if e.get('publicNote'):
            item['note'] = e['publicNote']
        if era:
            item['era'] = era
        if slug:
            item['eraSlug'] = slug
        if e['date'] in FEATURED_DATES and e.get('shortTitle') and e.get('paperDate'):
            item['featured'] = True
        out.append(item)

    ts = (
        '// 자동 생성 파일 — 직접 고치지 말 것. 원본: docs/product/time-machine-events/*.json, 생성기: scripts/build-timeline-events.py\n'
        '// 서로 독립된 출처 2개 이상이 같은 날짜를 확인한 사건(confirmed)만 들어 있다. 날짜는 사건일, paperDate는 보통 사건 다음 날 신문이 나온 날.\n'
        "import type { TimelineEvent } from './timelineEvents';\n\n"
        'export const TIMELINE_EVENTS: TimelineEvent[] = '
        + json.dumps(out, ensure_ascii=False, indent=2)
        + ';\n'
    )
    with open(OUT_TS, 'w', encoding='utf-8') as f:
        f.write(ts)

    lines = ['# 확인 필요(pending) 사건', '', '독립된 출처 2개가 같은 날짜를 확인하지 못해 화면에 올리지 않은 사건. 신문 원문 등 출처를 더 찾으면 `status`를 confirmed로 올리고 생성기를 다시 돌린다.', '']
    for e in sorted(pending, key=lambda x: x['date']):
        lines.append(f"- {e['date']} {e['title']} ({e['_file']}) — {e.get('note') or '사유 미기재'}")
    with open(PENDING_MD, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines) + '\n')

    # 월별 기사 수(관심도 곡선용) — 수집 스크립트(service/backend/scripts/build_timeline_attention.py)가 만든 attention.json을 화면용 TS로 옮긴다.
    if os.path.exists(ATTENTION_JSON):
        with open(ATTENTION_JSON, encoding='utf-8') as f:
            att = json.load(f)
        with open(ATTENTION_TS, 'w', encoding='utf-8') as f:
            f.write('// 자동 생성 파일 — 직접 고치지 말 것. 원본: docs/product/time-machine-events/attention.json, 생성기: scripts/build-timeline-events.py\n')
            f.write("// 서울경제 기사 중 그 달에 키워드가 들어간 기사 수(빅카인즈 total_hits). months[i]에 대응하는 값, null은 수집 실패.\n")
            f.write('export const ATTENTION = ' + json.dumps(att, ensure_ascii=False) + ' as const;\n')
        print('attention.json →', os.path.basename(ATTENTION_TS))
    print(f'confirmed {len(out)}건, pending {len(pending)}건, 시대 페이지 {sum(1 for s in ERA_SLUGS if era_counts.get(s, 0) >= MIN_EVENTS_FOR_ERA_PAGE)}개')
    print('시대별 사건 수:', dict(era_counts))
    print('featured:', [e['shortTitle'] for e in out if e.get('featured')])


if __name__ == '__main__':
    main()
