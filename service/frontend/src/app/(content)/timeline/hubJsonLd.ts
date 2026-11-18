import { DECADES, ERAS } from '@/shared/data/timelineEvents';
import { SITE_URL } from '@/shared/constants/site';

// /timeline 입구의 구조화 데이터 — 연대기·연대·시대 진입점을 ItemList로 알린다. 하위 페이지(chronicle·decade·era·날짜)는 각자 JSON-LD가 있어 입구에서만 내보낸다.
const HUB_ITEMS = [
  { name: '1990 → 2026 한국 경제 연대기', path: '/timeline/chronicle' },
  ...DECADES.map((d) => ({ name: `${d.label} 경제 사건 연표`, path: `/timeline/decade/${d.key}` })),
  ...ERAS.map((e) => ({ name: `${e.title} 연표`, path: `/timeline/era/${e.slug}` })),
];
export const HUB_JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  '@id': `${SITE_URL}/timeline#collection`,
  url: `${SITE_URL}/timeline`,
  name: '타임라인 — 경제 사건의 흐름',
  inLanguage: 'ko-KR',
  isPartOf: { '@id': `${SITE_URL}/#website` },
  publisher: { '@id': `${SITE_URL}/#organization` },
  mainEntity: {
    '@type': 'ItemList',
    itemListElement: HUB_ITEMS.map((it, i) => ({ '@type': 'ListItem', position: i + 1, name: it.name, url: `${SITE_URL}${it.path}` })),
  },
};
