import type { Metadata } from 'next';
import { fetchHomePlayerPosts } from '@/shared/lib/api/homePlayerApi';
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
