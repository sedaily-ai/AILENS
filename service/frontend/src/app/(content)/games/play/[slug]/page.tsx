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

import { SITE_URL } from '@/shared/constants/site';

// VideoGame + BreadcrumbList(2026-08-14, SEO 감사 — 이 라우트만 JSON-LD가
// 없던 걸 발견). 브라우저에서 바로 도는 H5 게임이라 applicationCategory를
// Game으로, operatingSystem을 "Any"로 명시 — 설치가 아니라 웹에서 즉시
// 플레이한다는 신호.
function buildJsonLd(slug: string, title: string) {
  const url = `${SITE_URL}/games/play/${slug}`;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'VideoGame',
        '@id': `${url}#game`,
        name: title,
        url,
        applicationCategory: 'Game',
        operatingSystem: 'Any (웹브라우저)',
        genre: 'Casual',
        publisher: { '@id': `${SITE_URL}/#organization` },
        isAccessibleForFree: true,
        image: `${SITE_URL}/og-image.png`,
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'AI LENS', item: SITE_URL },
          { '@type': 'ListItem', position: 2, name: '게임', item: `${SITE_URL}/games` },
          { '@type': 'ListItem', position: 3, name: title, item: url },
        ],
      },
    ],
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
  const jsonLd = buildJsonLd(slug, g.title);
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <GamePlayClient slug={slug} title={g.title} src={g.src} />
    </>
  );
}
