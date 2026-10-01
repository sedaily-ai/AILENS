import type { Metadata } from 'next';
import { fetchHomePlayerPosts } from '@/shared/lib/api/homePlayerApi';
import { CACHE_TTL_FALLBACK_SECONDS } from '@/shared/lib/api/cmsPostsApi';
import { ListenListClient } from './ListenListClient';
import { SITE_URL, LISTEN_LIST_TITLE as TITLE, LISTEN_LIST_DESCRIPTION as DESCRIPTION, buildListenJsonLd } from './listenListShared';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  // GEO 감사(2026-08-21) — 이 재생목록이 홈 하단 미니 플레이어에만 있어서
  // 고유 URL이 없어 검색엔진에 전혀 안 걸렸다는 걸 사용자가 직접 지적하며
  // 신설. /video, /webtoon과 같은 패턴(page.tsx 참조).
  keywords: ['오디오 뉴스', '경제 팟캐스트', '뉴스 듣기', '경제 뉴스 오디오', 'AI LENS', '서울경제'],
  alternates: { canonical: `${SITE_URL}/listen` },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `${SITE_URL}/listen`,
    type: 'website',
    images: [{ url: `${SITE_URL}/og-image.png`, width: 1200, height: 630, alt: 'AI LENS 오디오' }],
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

// 페이지네이션을 경로로 옮김(2026-08-28, lens/page.tsx와 같은 이유) — 2페이지
// 부터는 /listen/page/[n]/page.tsx.
// export const revalidate 명시(2026-09-30) — 카테고리 아카이브에서 같은
// 코드가 빌드마다 s-maxage=31536000으로 굳는 현상이 실측 확인돼, 이
// 라우트도 명시적으로 300초 고정(lens/page.tsx와 동일 조치).
export const revalidate = 300; // = CACHE_TTL_FALLBACK_SECONDS(cmsPostsApi.ts) — route segment config는 정적 분석돼 import한 상수를 못 쓴다, 값 바뀌면 여기도 같이 바꿀 것

export default async function ListenListPage() {
  const items = await fetchHomePlayerPosts();
  const jsonLd = buildListenJsonLd(items);
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ListenListClient initialItems={items} initialPage={1} />
    </>
  );
}
