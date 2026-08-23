import type { CmsWebtoon } from '@/shared/lib/api/cmsPostsApi';
import { SITE_URL } from '@/shared/constants/site';

export { SITE_URL };

// /webtoon, /webtoon/page/[n] 공용(2026-08-23, 쿼리스트링→경로 페이지네이션
// 전환) — lens/lensListShared.ts와 같은 이유. PAGE_SIZE는
// WebtoonListClient.tsx의 값과 반드시 일치해야 한다.
export const WEBTOON_LIST_TITLE = '웹툰 — 이슈를 컷으로';
export const WEBTOON_LIST_DESCRIPTION =
  '서울경제 AI LENS가 요즘 경제·사회 이슈를 흑백 펜화 웹툰으로 옮깁니다. 성과급 갈등, 세제개편, AI 데이터센터 같은 뉴스를 컷으로 이어 보여드려요.';
export const WEBTOON_PAGE_SIZE = 12;

export function buildWebtoonJsonLd(items: CmsWebtoon[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': `${SITE_URL}/webtoon#collection`,
    url: `${SITE_URL}/webtoon`,
    name: WEBTOON_LIST_TITLE,
    description: WEBTOON_LIST_DESCRIPTION,
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
      itemListElement: items.slice(0, 20).map((w, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: `${SITE_URL}/webtoon/${w.id}`,
        name: w.title,
      })),
    },
  };
}
