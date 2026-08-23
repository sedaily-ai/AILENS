import type { CmsLens } from '@/shared/lib/api/cmsPostsApi';

// /lens, /lens/page/[n] 공용(2026-08-23, 쿼리스트링→경로 페이지네이션 전환) —
// 두 라우트가 메타데이터·JSON-LD·페이지 크기를 반드시 같은 값으로 써야
// 해서 여기로 뽑았다. PAGE_SIZE는 LensListClient.tsx의 값과 반드시 일치
// 해야 한다(총 페이지 수 계산 기준 — 다르면 generateStaticParams가 실제
// 존재하지 않는 페이지를 만들거나 마지막 페이지를 빠뜨린다).
export const SITE_URL = 'https://ailens.sedaily.ai';
export const LENS_LIST_TITLE = '오늘의 이슈, 4가지 시선';
export const LENS_LIST_DESCRIPTION =
  '매일 올라오는 이슈를 레터·웹툰·팟캐스트·영상 네 형식으로 담아드려요. 같은 뉴스도 형식을 바꿔 보면 다르게 다가옵니다.';
export const LENS_PAGE_SIZE = 8;

export function buildLensJsonLd(items: CmsLens[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': `${SITE_URL}/lens#collection`,
    url: `${SITE_URL}/lens`,
    name: LENS_LIST_TITLE,
    description: LENS_LIST_DESCRIPTION,
    inLanguage: 'ko-KR',
    isPartOf: { '@id': `${SITE_URL}/#website` },
    publisher: { '@id': `${SITE_URL}/#organization` },
    author: {
      '@type': 'Organization',
      name: 'AI LENS 편집팀',
      description: '서울경제신문 기자들이 취재한 원본 기사를 바탕으로 AI가 요약·재구성한 초안을 작성하고, 편집팀이 검수해 발행합니다.',
      url: `${SITE_URL}/about`,
      parentOrganization: { '@id': `${SITE_URL}/#organization` },
    },
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: items.slice(0, 20).map((l, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: `${SITE_URL}/lens/${l.id}`,
        name: l.headline,
      })),
    },
  };
}
