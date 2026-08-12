import type { Metadata } from 'next';
import { fetchCmsPosts, fetchTrendCards, fetchVideos } from '@/shared/lib/cmsPostsApi';
import { buildArchiveItems, PAGE_SIZE, type ArchiveItem } from '@/shared/lib/archiveItems';
import { ArchiveHubClient } from './ArchiveHubClient';

// 콘텐츠 타입별 페이지 분리(2026-08-11)로 /letters가 레터 전용이 되면서,
// "전체 모아보기"가 갈 곳이 필요해 새로 만든 라우트 — 예전 /letters의 역할을
// 그대로 이어받는다(레터+트렌드+칼럼+영상 통합 리스트).
const SITE_URL = 'https://ailens.sedaily.ai';
const TITLE = '지금까지의 모든 콘텐츠';
const DESCRIPTION = 'AI LENS가 정리한 경제 브리핑·딥다이브·인사이트·영상을 한 곳에서 모아봅니다. 서울경제신문이 취재한 원본 기사를 바탕으로 AI가 요약·재구성한 경제 뉴스 아카이브.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  // GEO 감사(2026-08-12, letters/page.tsx 주석 참조) — 키워드 커버리지 확장.
  keywords: ['AI LENS', '서울경제', '경제 뉴스 모음', 'AI 경제 뉴스', '경제 브리핑', '경제 딥다이브', '경제 인사이트'],
  alternates: { canonical: `${SITE_URL}/archive` },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `${SITE_URL}/archive`,
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
    '@id': `${SITE_URL}/archive#collection`,
    url: `${SITE_URL}/archive`,
    name: TITLE,
    description: DESCRIPTION,
    keywords: 'AI LENS, 서울경제, 경제 뉴스 모음, AI 경제 뉴스, 경제 브리핑, 경제 딥다이브, 경제 인사이트',
    inLanguage: 'ko-KR',
    isPartOf: { '@id': `${SITE_URL}/#website` },
    publisher: { '@id': `${SITE_URL}/#organization` },
    // 공신력 신호(2026-08-12) — 목록 페이지도 상세 페이지(letters/[id] 등)와
    // 같은 author Organization을 명시해 "서울경제신문이 검수한다"는 관계를
    // 목록 단계에서부터 드러낸다.
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

export default async function ArchiveHubPage() {
  const [letters, cards, videos] = await Promise.all([
    fetchCmsPosts('letters', undefined, PAGE_SIZE),
    fetchTrendCards(),
    fetchVideos(),
  ]);
  const initialItems = buildArchiveItems(letters, cards, videos);
  const jsonLd = buildJsonLd(initialItems);
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ArchiveHubClient initialItems={initialItems} />
    </>
  );
}
