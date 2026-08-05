import type { Metadata } from 'next';
import GamesClient from './GamesClient';

export const metadata: Metadata = {
  title: 'AI LENS 게임 — 가볍게 한 판',
  description:
    'AI LENS 가 직접 만든 서울경제 H5 게임. 출근길·점심·잠들기 전 가볍게 한 판.',
  alternates: { canonical: 'https://ailens.sedaily.ai/games' },
  openGraph: {
    title: 'AI LENS 게임 — 가볍게 한 판',
    description: '출근길·점심·잠들기 전 가볍게 즐기는 H5 게임.',
    url: 'https://ailens.sedaily.ai/games',
    type: 'website',
  },
};

export default function GamesPage() {
  return <GamesClient />;
}
