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

// searchParams를 읽지 않는다. ?page=N을 서버 컴포넌트가 읽으면 Next가 이 라우트를 fully dynamic으로 고정해 CloudFront 캐시가 걸리지 않는다.
// 페이지네이션은 /lens/page/[n]/page.tsx에서 처리하며, 1페이지(이 파일)는 [slug] 페이지들과 같은 force-cache+revalidate 캐시를 받는다.
//
// export const revalidate를 명시한다. fetch 레벨 revalidate:300만 두면 일부 카테고리 아카이브가 빌드마다 s-maxage=31536000(사실상 영구)으로 굳을 수 있다
// (빌드 시점 fetch 성공/실패에 따라 Full Route Cache 판정이 달라지는 것으로 추정). 명시하면 항상 300초로 고정된다.
export const revalidate = 300; // = CACHE_TTL_FALLBACK_SECONDS(cmsPostsApi.ts). route segment config는 정적 분석되어 import한 상수를 쓸 수 없으므로 값 변경 시 함께 수정한다.

export default async function LensListPage() {
  // 우측 사이드바(HomeSideBar) 서버 프리페치 — 홈/카테고리 페이지와 같은 이유(economyCategoryPage.tsx 참조).
  const [items, hotLetters] = await Promise.all([fetchLensPosts(), fetchFollowingLetters(10)]);
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
