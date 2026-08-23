import type { Metadata } from 'next';
import { fetchLensPosts } from '@/shared/lib/api/cmsPostsApi';
import { fetchFollowingLetters } from '@/shared/lib/api/todayLettersApi';
import { LensListClient } from './LensListClient';
import { SITE_URL, LENS_LIST_TITLE as TITLE, LENS_LIST_DESCRIPTION as DESCRIPTION, buildLensJsonLd } from './lensListShared';

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

// searchParams 제거(2026-08-23, 캐시 복구 — "더 빠르게" 요청) — ?page=N을
// 서버 컴포넌트가 읽는 순간 Next가 이 라우트 전체를 fully dynamic으로
// 못박아서 CloudFront가 캐시를 못 걸었다(실측: x-cache 항상 Miss, TTFB
// 800ms대 — 홈/[slug] 페이지들은 같은 기간 60초~5분 캐시가 정상 작동).
// 페이지네이션은 /lens/page/[n]/page.tsx로 옮겼다 — 1페이지(=이 파일)는
// searchParams를 아예 안 읽으므로 [slug] 페이지들과 같은 force-cache+
// revalidate 캐시를 다시 받는다.
export default async function LensListPage() {
  // 우측 사이드바(HomeSideBar) 서버 프리페치(2026-08-23) — 홈/카테고리
  // 페이지와 같은 이유(economyCategoryPage.tsx 참조).
  const [items, hotLetters] = await Promise.all([fetchLensPosts(), fetchFollowingLetters(5)]);
  const jsonLd = buildLensJsonLd(items);
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <LensListClient initialItems={items} initialPage={1} initialHotLetters={hotLetters} />
    </>
  );
}
