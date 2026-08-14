import type { Metadata } from 'next';
import { fetchLensPosts, type CmsLens } from '@/shared/lib/cmsPostsApi';
import { LensListClient } from './LensListClient';

const SITE_URL = 'https://ailens.sedaily.ai';
const TITLE = '오늘의 이슈, 4가지 시선';
// 본문 카피와 축을 맞춘다(2026-08-14). 이전 문구는 질문 축("원인이 궁금한
// 사람" 등)이었는데 화면 본문은 역할 축(사회초년생·직장인·자영업자·투자자)으로
// 바뀌어서, 검색 결과·공유 카드와 실제 페이지가 서로 다른 개념을 말하고 있었다.
//
// "하루 하나의 이슈"도 함께 걷어냈다 — 실제 발행량은 하루 14~18건이다.
// (2026-08-14 기준 16건) 문구가 발행 실태와 어긋나면 목록에 들어온 독자가
// 바로 모순을 본다.
const DESCRIPTION =
  '매일 올라오는 이슈를 사회초년생·직장인·자영업자·투자자 — 네 사람의 눈으로 나눠 짚어드려요. 같은 뉴스도 내 입장에서 읽으면 의미가 달라집니다.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: ['오늘의 이슈', '4가지 시선', '뉴스 해설', '이슈 브리핑', 'AI LENS', '서울경제'],
  alternates: { canonical: `${SITE_URL}/lens` },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `${SITE_URL}/lens`,
    type: 'website',
    images: [{ url: `${SITE_URL}/og-image.png`, width: 1200, height: 630, alt: 'AI LENS — 4가지 시선' }],
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

// 서버 컴포넌트(2026-08-12) — /webtoon, /timeline 등과 같은 SSR 원칙: 목록을
// 서버에서 미리 가져와 initialItems로 내려서 첫 페인트부터 실제 목록이
// 박히게 한다(크롤러도 스켈레톤이 아니라 실제 콘텐츠를 본다).
function buildJsonLd(items: CmsLens[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': `${SITE_URL}/lens#collection`,
    url: `${SITE_URL}/lens`,
    name: TITLE,
    description: DESCRIPTION,
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

export default async function LensListPage() {
  const items = await fetchLensPosts();
  const jsonLd = buildJsonLd(items);
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <LensListClient initialItems={items} />
    </>
  );
}
