import type { CmsLens } from '@/shared/lib/api/cmsPostsApi';
import { SITE_URL } from '@/shared/constants/site';
import { lensPath } from '@/shared/lib/content/lensUrl';
import { seoHeadline } from '@/shared/lib/content/displayHeadline';

export { SITE_URL };

// /lens, /lens/page/[n] 공용 — 두 라우트가 메타데이터·JSON-LD·페이지 크기를 같은 값으로 써야 하므로 여기에 둔다.
// PAGE_SIZE는 LensListClient.tsx의 값과 일치해야 한다(총 페이지 수 계산 기준 — 다르면 generateStaticParams가 존재하지 않는 페이지를 만들거나 마지막 페이지를 빠뜨린다).
export const LENS_LIST_TITLE = '오늘의 이슈, 4가지 시선';
export const LENS_LIST_DESCRIPTION =
  '서울경제신문 기자가 취재한 매일의 경제 이슈를 레터·웹툰·팟캐스트·영상 네 가지 형식으로 담았습니다. 같은 뉴스도 읽고, 보고, 듣는 방식을 바꿔 고르면 더 쉽게 이해됩니다. 시그널·부동산·경제·금융·산업·정치·사회·국제·문화 이슈를 날짜순으로 모아 보세요.';

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
        url: `${SITE_URL}${lensPath(l)}`,
        name: seoHeadline(l.headline),
      })),
    },
  };
}
