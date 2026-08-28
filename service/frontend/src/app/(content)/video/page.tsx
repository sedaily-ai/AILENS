import type { Metadata } from 'next';
import { fetchVideos } from '@/shared/lib/api/cmsPostsApi';
import { VideoListClient } from './VideoListClient';
import { SITE_URL, VIDEO_LIST_TITLE as TITLE, VIDEO_LIST_DESCRIPTION as DESCRIPTION, buildVideoJsonLd } from './videoListShared';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  // GEO 감사(2026-08-12, letters/page.tsx 주석 참조) — 키워드 커버리지 확장.
  keywords: ['영상', '뉴스 영상', '경제 뉴스 영상', '숏폼 뉴스', '경제 유튜브', '시사 영상', 'AI LENS', '서울경제'],
  alternates: { canonical: `${SITE_URL}/video` },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `${SITE_URL}/video`,
    type: 'website',
    images: [{ url: `${SITE_URL}/og-image.png`, width: 1200, height: 630, alt: 'AI LENS 영상' }],
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

// 페이지네이션을 경로로 옮김(2026-08-28, lens/page.tsx와 같은 이유) —
// searchParams를 읽으면 이 라우트 전체가 fully dynamic으로 못박혀 CDN이
// 캐시를 못 건다. 2페이지부터는 /video/page/[n]/page.tsx.
export default async function VideoListPage() {
  const items = await fetchVideos();
  const jsonLd = buildVideoJsonLd(items);
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <VideoListClient initialItems={items} initialPage={1} />
    </>
  );
}
