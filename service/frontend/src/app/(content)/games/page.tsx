import type { Metadata } from 'next';
import GamesClient from './GamesClient';
// 게임 목록은 단일 출처(shared/data/games.ts)에서 가져온다. page 모듈에서 가져오면 FSD 경계를 위반하고 프로덕션 빌드를 막는다.
import { GAMES } from '@/shared/data/games';

import { SITE_URL } from '@/shared/constants/site';
const TITLE = 'AI LENS 게임 — 가볍게 한 판';
const DESCRIPTION = 'AI LENS가 직접 만든 서울경제 H5 미니게임 모음입니다. 설치 없이 브라우저에서 바로, 출근길·점심시간·잠들기 전에 가볍게 한 판 즐겨 보세요.';

// CollectionPage + ItemList — sitemap.ts와 같은 이유로 GAMES를 재사용해 개별 VideoGame 엔트리를 참조한다.
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
