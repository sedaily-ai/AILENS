import type { Metadata } from 'next';
import { fetchCmsPosts, fetchTrendCards } from '@/shared/lib/cmsPostsApi';
import { buildArchiveItems, PAGE_SIZE, type ArchiveItem } from '@/shared/lib/archiveItems';
import { ColumnListClient } from './ColumnListClient';

// letters/page.tsx, trend/page.tsx와 같은 이유로 신설(2026-08-11) — "이번 주
// 인기 칼럼" 홈 섹션의 더보기가 여기로 온다(ColumnPreviewSection.tsx, 예전엔
// /letters 통합 페이지로 갔었음).
// 라벨 워딩 개편(2026-08-12, headerTabs.ts 주석 참조) — "칼럼"은 무난하지만
// "오피니언"은 무겁다는 지적으로, 이미 부제로 쓰던 "관점 있는 시선"에서 따와
// "인사이트"로. URL(/column)은 그대로.
const SITE_URL = 'https://ailens.sedaily.ai';
// GEO 감사(2026-08-12) — 나브 라벨("인사이트")은 짧아서 주제 신호가 없는 게
// 정상이지만, description까지 "경제"를 안 담고 있으면 AI/검색엔진이 이 페이지
// 주제를 브리핑·딥다이브만큼 명확히 못 읽는다("이번 주 눈여겨볼 이슈"는
// 어떤 분야든 될 수 있는 문장). 나머지 두 페이지처럼 "경제"를 명시.
const TITLE = '인사이트 — 관점 있는 시선';
const DESCRIPTION = '이번 주 눈여겨볼 경제 이슈를 관점 있는 시선으로 짚어봅니다. 단순 요약이 아니라 왜 중요한지, 어떤 의미가 있는지까지 짚는 경제 오피니언·칼럼. 지금까지의 인사이트를 한 곳에서 다시 볼 수 있습니다.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  // GEO 감사(2026-08-12, letters/page.tsx 주석 참조) — 키워드 커버리지 확장.
  keywords: ['경제 인사이트', 'AI LENS 인사이트', '경제 칼럼', '경제 오피니언', '경제 전망', '투자 인사이트', '재테크 칼럼', '서울경제'],
  alternates: { canonical: `${SITE_URL}/column` },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `${SITE_URL}/column`,
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
    '@id': `${SITE_URL}/column#collection`,
    url: `${SITE_URL}/column`,
    name: TITLE,
    description: DESCRIPTION,
    keywords: '경제 인사이트, AI LENS 인사이트, 경제 칼럼, 경제 오피니언, 경제 전망, 투자 인사이트, 서울경제',
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

export default async function ColumnArchivePage() {
  const [letters, cards] = await Promise.all([
    fetchCmsPosts('letters', undefined, PAGE_SIZE),
    fetchTrendCards(),
  ]);
  const initialItems = buildArchiveItems(letters, cards, []).filter((it) => it.kind === 'column');
  const jsonLd = buildJsonLd(initialItems);
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ColumnListClient initialItems={initialItems} />
    </>
  );
}
