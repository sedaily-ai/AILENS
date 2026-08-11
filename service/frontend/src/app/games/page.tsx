import type { Metadata } from 'next';
import GamesClient from './GamesClient';

const SITE_URL = 'https://ailens.sedaily.ai';
const TITLE = 'AI LENS 게임 — 가볍게 한 판';
const DESCRIPTION = 'AI LENS 가 직접 만든 서울경제 H5 게임. 출근길·점심·잠들기 전 가볍게 한 판.';

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
  return <GamesClient />;
}
