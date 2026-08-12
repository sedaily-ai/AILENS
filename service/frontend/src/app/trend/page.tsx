import type { Metadata } from 'next';
import { fetchCmsPosts, fetchTrendCards } from '@/shared/lib/cmsPostsApi';
import { buildArchiveItems, PAGE_SIZE, type ArchiveItem } from '@/shared/lib/archiveItems';
import { TrendListClient } from './TrendListClient';

// letters/page.tsx와 같은 이유로 신설(2026-08-11) — "요즘 화제의 경제 이슈"
// 홈 섹션의 더보기가 여기로 온다(TrendingEconomySection.tsx, 예전엔 /letters
// 통합 페이지로 갔었음).
// 라벨 워딩 개편(2026-08-12, headerTabs.ts 주석 참조) — "트렌드"가 "요즘
// 뜨는 것"으로 오해되기 쉽다는 지적으로 "딥다이브"로. URL(/trend)은 그대로.
const SITE_URL = 'https://ailens.sedaily.ai';
const TITLE = '딥다이브 — 같은 사실, 네 가지 관점';
const DESCRIPTION = '요즘 화제인 경제 이슈 하나를 놓고 네 가지 관점으로 깊이 파고듭니다. 같은 사실도 보는 각도에 따라 다르게 읽히는 경제·시사 이슈 분석. 지금까지의 딥다이브를 한 곳에서 다시 볼 수 있습니다.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  // GEO 감사(2026-08-12, letters/page.tsx 주석 참조) — 키워드 커버리지 확장.
  keywords: ['경제 딥다이브', 'AI LENS 딥다이브', '경제 이슈 분석', '경제 트렌드', '시사 이슈', '다각도 분석', '경제 인사이트 분석', '서울경제'],
  alternates: { canonical: `${SITE_URL}/trend` },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `${SITE_URL}/trend`,
    type: 'website',
    images: [{ url: `${SITE_URL}/og-image.png`, width: 1200, height: 630, alt: 'AI LENS' }],
    locale: 'ko_KR',
    siteName: 'AI LENS — 서울경제',
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: [`${SITE_URL}/og-image.png`],
  },
};

function buildJsonLd(items: ArchiveItem[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': `${SITE_URL}/trend#collection`,
    url: `${SITE_URL}/trend`,
    name: TITLE,
    description: DESCRIPTION,
    keywords: '경제 딥다이브, AI LENS 딥다이브, 경제 이슈 분석, 경제 트렌드, 시사 이슈, 다각도 분석, 서울경제',
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
      itemListElement: items
        .filter((it) => it.href)
        .slice(0, 20)
        .map((it, i) => ({
          '@type': 'ListItem',
          position: i + 1,
          url: it.external ? it.href! : `${SITE_URL}${it.href}`,
          name: it.title,
        })),
    },
  };
}

export default async function TrendArchivePage() {
  const [letters, cards] = await Promise.all([
    fetchCmsPosts('letters', undefined, PAGE_SIZE),
    fetchTrendCards(),
  ]);
  const initialItems = buildArchiveItems(letters, cards, []).filter((it) => it.kind === 'trend');
  const jsonLd = buildJsonLd(initialItems);
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <TrendListClient initialItems={initialItems} />
    </>
  );
}
