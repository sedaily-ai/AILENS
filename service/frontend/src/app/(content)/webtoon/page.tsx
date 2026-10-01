import type { Metadata } from 'next';
import { fetchWebtoons, CACHE_TTL_FALLBACK_SECONDS } from '@/shared/lib/api/cmsPostsApi';
import { WebtoonListClient } from './WebtoonListClient';
import {
  SITE_URL,
  WEBTOON_LIST_TITLE as TITLE,
  WEBTOON_LIST_DESCRIPTION as DESCRIPTION,
  buildWebtoonJsonLd,
} from './webtoonListShared';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: ['웹툰', '뉴스 웹툰', '시사 웹툰', '경제 웹툰', 'AI LENS', '서울경제'],
  alternates: { canonical: `${SITE_URL}/webtoon` },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `${SITE_URL}/webtoon`,
    type: 'website',
    images: [{ url: `${SITE_URL}/og-image.png`, width: 1200, height: 630, alt: 'AI LENS 웹툰' }],
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

// searchParams 제거(2026-08-23, 캐시 복구 — "더 빠르게" 요청) — lens/page.tsx
// 상단 주석과 같은 이유·같은 수정. 페이지네이션은 /webtoon/page/[n]/page.tsx로
// 옮겼다.
//
// export const revalidate 명시(2026-09-30) — 카테고리 아카이브에서 같은
// 코드가 빌드마다 s-maxage=31536000으로 굳는 현상이 실측 확인돼, 이
// 라우트도 명시적으로 300초 고정(lens/page.tsx와 동일 조치).
export const revalidate = 300; // = CACHE_TTL_FALLBACK_SECONDS(cmsPostsApi.ts) — route segment config는 정적 분석돼 import한 상수를 못 쓴다, 값 바뀌면 여기도 같이 바꿀 것

export default async function WebtoonListPage() {
  const items = await fetchWebtoons();
  const jsonLd = buildWebtoonJsonLd(items);
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <WebtoonListClient initialItems={items} initialPage={1} />
    </>
  );
}
