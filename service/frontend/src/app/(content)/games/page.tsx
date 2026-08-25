import type { Metadata } from 'next';
import GamesClient from './GamesClient';
// 2026-08-25: `./play/[slug]/page` 에서 가져오던 것을 단일 출처로 교체.
// app → app 참조라 FSD boundaries 위반이기도 했고, 그 page 모듈의 `GAMES`
// export 자체가 프로덕션 빌드를 막고 있었다(shared/data/games.ts 주석 참조).
import { GAMES } from '@/shared/data/games';

import { SITE_URL } from '@/shared/constants/site';
const TITLE = 'AI LENS 게임 — 가볍게 한 판';
const DESCRIPTION = 'AI LENS 가 직접 만든 서울경제 H5 게임. 출근길·점심·잠들기 전 가볍게 한 판.';

// CollectionPage + ItemList(2026-08-14, SEO 감사) — sitemap.ts와 같은 이유로
// GAMES를 재사용해 개별 VideoGame 엔트리를 참조한다.
const JSON_LD = {
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  '@id': `${SITE_URL}/games#collection`,
  url: `${SITE_URL}/games`,
  name: TITLE,
  description: DESCRIPTION,
  inLanguage: 'ko-KR',
  isPartOf: { '@id': `${SITE_URL}/#website` },
  publisher: { '@id': `${SITE_URL}/#organization` },
  mainEntity: {
    '@type': 'ItemList',
    itemListElement: GAMES.map((g, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      url: `${SITE_URL}/games/play/${g.slug}`,
      name: g.title,
    })),
  },
};

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/games` },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `${SITE_URL}/games`,
    type: 'website',
    images: [{ url: `${SITE_URL}/og-image.png`, width: 1200, height: 630, alt: 'AI LENS 게임' }],
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

export default function GamesPage() {
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD) }}
      />
      <GamesClient />
    </>
  );
}
