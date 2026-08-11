import type { Metadata } from 'next';
import GamePlayClient from './GamePlayClient';

// sitemap.ts가 이 슬러그 목록을 그대로 재사용한다(SEO 감사 2026-08-11 —
// /games/play/[slug]가 sitemap에서 빠져있던 걸 발견, GAMES를 export해서
// 한 곳에서만 관리).
export const GAMES: Record<string, { title: string; src: string }> = {
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
  const title = `${g.title} — 게임`;
  const description = `AI LENS 안에서 바로 플레이하는 ${g.title}.`;
  const url = `https://ailens.sedaily.ai/games/play/${slug}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      type: 'website',
      images: [{ url: 'https://ailens.sedaily.ai/og-image.png', width: 1200, height: 630, alt: g.title }],
      locale: 'ko_KR',
      siteName: 'AI LENS — 서울경제',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: ['https://ailens.sedaily.ai/og-image.png'],
    },
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
