import type { Metadata } from 'next';
import GamePlayClient from './GamePlayClient';
// 게임 목록은 shared/data/games.ts 가 단일 출처다. 이 파일이 `export const GAMES`
// 로 들고 있던 걸 옮겼다(2026-08-25) — page 모듈은 Next 가 정한 이름만 export
// 할 수 있어서 임의 이름 `GAMES` 가 프로덕션 빌드의 타입 검사를 실패시켰다.
// 자세한 경위는 그 파일 상단 주석 참조.
import { GAMES, GAMES_BY_SLUG } from '@/shared/data/games';
import { SITE_URL } from '@/shared/constants/site';

export function generateStaticParams() {
  return GAMES.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const g = GAMES_BY_SLUG[slug];
  if (!g) return { title: '게임을 찾을 수 없어요', robots: { index: false } };
  const title = `${g.title} — 게임`;
  const description = `AI LENS 안에서 바로 플레이하는 ${g.title}.`;
  const url = `${SITE_URL}/games/play/${slug}`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      type: 'website',
      images: [{ url: `${SITE_URL}/og-image.png`, width: 1200, height: 630, alt: g.title }],
      locale: 'ko_KR',
      siteName: 'AI LENS — 서울경제',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [`${SITE_URL}/og-image.png`],
    },
  };
}

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
  const g = GAMES_BY_SLUG[slug];
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
