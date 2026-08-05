import type { Metadata } from 'next';
import GamePlayClient from './GamePlayClient';

const GAMES: Record<string, { title: string; src: string }> = {
  'cat-blanket': {
    title: '고양이 이불 덮어주기',
    src: '/games/cat-blanket/index.html',
  },
  'protect-newspaper': {
    title: '내일 신문을 지켜라!',
    src: '/games/protect-newspaper/index.html',
  },
};

export function generateStaticParams() {
  return Object.keys(GAMES).map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const g = GAMES[slug];
  if (!g) return { title: '게임을 찾을 수 없어요', robots: { index: false } };
  return {
    title: `${g.title} — AI LENS 게임`,
    description: `AI LENS 안에서 바로 플레이하는 ${g.title}.`,
    alternates: { canonical: `https://ailens.sedaily.ai/games/play/${slug}` },
  };
}

export default async function GamePlayPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const g = GAMES[slug];
  if (!g) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black text-white">
        <p>게임을 찾을 수 없어요.</p>
      </div>
    );
  }
  return <GamePlayClient slug={slug} title={g.title} src={g.src} />;
}
