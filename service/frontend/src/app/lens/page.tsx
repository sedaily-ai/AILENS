import type { Metadata } from 'next';
import { fetchLensPosts, type CmsLens } from '@/shared/lib/cmsPostsApi';
import { LensListClient } from './LensListClient';

const SITE_URL = 'https://ailens.sedaily.ai';
const TITLE = '오늘의 이슈, 4가지 시선';
const DESCRIPTION =
  '하루 하나의 이슈를 원인이 궁금한 사람, 사람이 먼저 보이는 사람, 내 일이 걱정되는 사람, 숫자부터 찾는 사람 — 4가지 시선으로 짚어드려요.';

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

// 페이지네이션을 진짜 URL로(2026-08-14, GEO 감사) — 이전엔 onClick+useState라
// 서버가 내려주는 첫 HTML에 최신글 포함 9개만 <a href> 링크로 존재하고 나머지는
// 크롤러가 못 밟는 상태였다. searchParams.page를 서버에서 읽어 currentPage를
// 계산해 내려주고, 클라이언트 쪽 페이지 버튼도 <Link href="/lens?page=N">로
// 바꿔서 각 페이지가 고유 크롤 가능 URL이 되도록 한다.
export default async function LensListPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page } = await searchParams;
  const items = await fetchLensPosts();
  const jsonLd = buildJsonLd(items);
  const initialPage = Math.max(1, parseInt(page ?? '1', 10) || 1);
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <LensListClient initialItems={items} initialPage={initialPage} />
    </>
  );
}
