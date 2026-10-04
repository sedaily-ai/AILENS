import type { CmsLens } from '@/shared/lib/api/cmsPostsApi';
import { SITE_URL } from '@/shared/constants/site';
import { seoHeadline } from '@/shared/lib/content/displayHeadline';
import { lensPath } from '@/shared/lib/content/lensUrl';
import { pickLensPhoto } from '@/shared/constants/lensPerspectives';

// "지난 지면" 페이지(/paper/[date]) 공용 — 날짜 표기·메타·JSON-LD(2026-10-04, 사용자 요청: "전날·전전날의 지면 4개 유형 기사도 볼 수 있게").
// 지면 = 홈 "오늘의 이슈, 4가지 시선"의 4개 탭(지면 1면·증권 1면·산업 1면·시그널 1면)에 편성된 기사 — 날짜당 최대 16건.
// 일반(지면 외) 기사는 이 페이지에 넣지 않는다(사용자 결정).

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/** "2026-10-03" → { year, month, day, weekday(금) } — 요일은 KST 날짜 기준(타임존에 흔들리지 않게 UTC 정오로 계산). */
export function parsePaperDate(date: string) {
  const [y, m, d] = date.split('-').map(Number);
  const weekday = WEEKDAYS[new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay()];
  return { year: y, month: m, day: d, weekday };
}

/** "2026년 10월 3일" */
export function paperDateLabel(date: string): string {
  const { year, month, day } = parsePaperDate(date);
  return `${year}년 ${month}월 ${day}일`;
}

/** 날짜 칩용 "10.03 금" */
export function paperChipLabel(date: string): string {
  const { month, day, weekday } = parsePaperDate(date);
  return `${String(month).padStart(2, '0')}.${String(day).padStart(2, '0')} ${weekday}`;
}

export function paperPath(date: string): string {
  return `/paper/${date}`;
}

/** 검색 결과용 설명 — 각 지면의 대표(첫) 기사 제목을 이어 붙인다. */
export function buildPaperDescription(date: string, items: CmsLens[]): string {
  const first = (section: string) => items.find((l) => l.paper_section === section);
  const parts = [
    ['지면 1면', first('전체')],
    ['증권 1면', first('증권')],
    ['산업 1면', first('산업')],
    ['시그널 1면', first('시그널')],
  ]
    .filter((p): p is [string, CmsLens] => !!p[1])
    .map(([label, l]) => `${label} ${seoHeadline(l.headline)}`);
  const text = `${paperDateLabel(date)} AI LENS 지면 — ${parts.join(' · ')}`;
  return text.length > 155 ? `${text.slice(0, 154)}…` : text;
}

const SECTION_LABELS: Record<string, string> = { 전체: '지면 1면', 증권: '증권 1면', 산업: '산업 1면', 시그널: '시그널 1면' };

/** 검색·AI 답변용 키워드 — 날짜 + 지면 이름 + 고정어. */
export function paperKeywords(date: string): string[] {
  return [`${paperDateLabel(date)} 지면`, `${paperDateLabel(date)} 경제 뉴스`, '지면 1면', '증권 1면', '산업 1면', '시그널 1면', '지난 지면', '오늘의 이슈', '4가지 시선', 'AI LENS', '서울경제'];
}

export function buildPaperJsonLd(date: string, items: CmsLens[]) {
  const url = `${SITE_URL}${paperPath(date)}`;
  const title = `${paperDateLabel(date)} 지면`;
  const published = `${date}T07:00:00+09:00`;
  // 지면(탭)별 묶음 — "그날 증권 1면은 뭐였지?" 같은 질문에 AI가 지면 단위로 답할 수 있게 각 지면을 별도 목록으로 노출한다.
  const sections = Object.keys(SECTION_LABELS)
    .map((key) => ({ key, list: items.filter((l) => l.paper_section === key) }))
    .filter((x) => x.list.length > 0);
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        '@id': `${url}#page`,
        url,
        name: `${title} — 오늘의 이슈, 4가지 시선`,
        description: buildPaperDescription(date, items),
        keywords: paperKeywords(date).join(', '),
        inLanguage: 'ko-KR',
        datePublished: published,
        dateModified: published,
        isAccessibleForFree: true,
        about: sections.map((x) => ({ '@type': 'Thing', name: SECTION_LABELS[x.key] })),
        isPartOf: { '@id': `${SITE_URL}/#website` },
        publisher: { '@id': `${SITE_URL}/#organization` },
        breadcrumb: { '@id': `${url}#breadcrumb` },
        primaryImageOfPage: items[0] ? { '@type': 'ImageObject', url: pickLensPhoto(items[0]) || items[0].cover_image_url || `${SITE_URL}/og-image.png` } : undefined,
        mainEntity: {
          '@type': 'ItemList',
          itemListElement: items.map((l, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            url: `${SITE_URL}${lensPath(l)}`,
            name: seoHeadline(l.headline),
          })),
        },
        hasPart: sections.map((x) => ({
          '@type': 'ItemList',
          name: `${paperDateLabel(date)} ${SECTION_LABELS[x.key]}`,
          itemListElement: x.list.map((l, i) => ({
            '@type': 'ListItem',
            position: i + 1,
            url: `${SITE_URL}${lensPath(l)}`,
            name: seoHeadline(l.headline),
          })),
        })),
      },
      {
        '@type': 'BreadcrumbList',
        '@id': `${url}#breadcrumb`,
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'AI LENS', item: SITE_URL },
          { '@type': 'ListItem', position: 2, name: '지면', item: `${SITE_URL}/paper` },
          { '@type': 'ListItem', position: 3, name: title, item: url },
        ],
      },
    ],
  };
}
