import type { Metadata } from 'next';
import { fetchWebtoons, type CmsWebtoon } from '@/shared/lib/api/cmsPostsApi';
import { buildPageTitle } from '@/shared/lib/seo/buildPageTitle';
import { WebtoonViewClient } from './WebtoonViewClient';

import { SITE_URL } from '@/shared/constants/site';

// 경로 기반(2026-08-07) 그대로. fetchWebtoons() 단발 실패(API Gateway/Lambda
// 콜드스타트 등)에 바로 "찾을 수 없어요"로 떨어지지 않도록 가벼운 재시도를
// 유지한다.
async function fetchAllWebtoons(): Promise<CmsWebtoon[]> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const result = await fetchWebtoons();
      if (result.length > 0) return result;
    } catch {
      // 다음 시도로.
    }
    if (attempt < 2) await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
  }
  return [];
}

// generateStaticParams 를 다시 붙인다(2026-08-08) — letters/[id]/page.tsx와
// 동일 이유: 이게 없으면 Next가 이 라우트를 ƒ Dynamic 취급해서 <Link>
// 프리페치가 안 붙는다("클릭 즉시 이동" 요구와 충돌, 직접 빌드해서 확인함).
export async function generateStaticParams() {
  const webtoons = await fetchAllWebtoons();
  return webtoons.map((w) => ({ slug: w.id }));
}

async function findWebtoon(slug: string): Promise<CmsWebtoon | null> {
  const webtoons = await fetchAllWebtoons();
  return webtoons.find((w) => w.id === slug) ?? null;
}

// 목록은 최신순(desc)으로 내려온다 — index-1이 더 최신 화("다음 화"),
// index+1이 더 과거 화("이전 화").
async function findNeighbors(slug: string): Promise<{
  episodeLabel: string | undefined;
  next: CmsWebtoon | null;
  prev: CmsWebtoon | null;
}> {
  const webtoons = await fetchAllWebtoons();
  const idx = webtoons.findIndex((w) => w.id === slug);
  if (idx === -1) return { episodeLabel: undefined, next: null, prev: null };
  return {
    episodeLabel: `${webtoons.length - idx}화`,
    next: webtoons[idx - 1] ?? null,
    prev: webtoons[idx + 1] ?? null,
  };
}

function trimDescription(s: string, max = 160): string {
  if (s.length <= max) return s;
  const cut = s.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return (lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[.,;:·\s]+$/, '') + '…';
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug);
  const webtoon = await findWebtoon(slug);
  if (!webtoon) {
    return { title: '웹툰을 찾을 수 없어요', robots: { index: false } };
  }
  const title = buildPageTitle(webtoon.title, '웹툰');
  const description = trimDescription(webtoon.excerpt || '요즘 이슈를 컷으로 이어 보여드려요.');
  const url = `${SITE_URL}/webtoon/${slug}`;
  const image = webtoon.cover_image_url || webtoon.panels[0]?.url || `${SITE_URL}/og-image.png`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      type: 'article',
      publishedTime: `${webtoon.date}T07:00:00+09:00`,
      images: [{ url: image, width: 1200, height: 800, alt: webtoon.title }],
      locale: 'ko_KR',
      siteName: 'AI LENS — 서울경제',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image],
    },
  };
}

function buildJsonLd(webtoon: CmsWebtoon, slug: string) {
  const url = `${SITE_URL}/webtoon/${slug}`;
  const published = `${webtoon.date}T07:00:00+09:00`;
  const image = webtoon.cover_image_url || webtoon.panels[0]?.url || `${SITE_URL}/og-image.png`;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        '@id': `${url}#article`,
        mainEntityOfPage: { '@type': 'WebPage', '@id': url },
        headline: webtoon.title,
        description: webtoon.excerpt,
        datePublished: published,
        dateModified: published,
        inLanguage: 'ko-KR',
        author: {
          '@type': 'Organization',
          name: 'AI LENS 편집팀',
          description:
            '서울경제신문 기자들이 취재한 원본 기사를 바탕으로 AI가 요약·재구성한 초안을 작성하고, 편집팀이 검수해 발행합니다.',
          url: `${SITE_URL}/about`,
          parentOrganization: { '@id': `${SITE_URL}/#organization` },
        },
        publisher: { '@id': `${SITE_URL}/#organization` },
        image: { '@type': 'ImageObject', url: image, width: 1200, height: 800 },
        isAccessibleForFree: true,
      },
      // 2026-08-21 GEO 재감사 — letters/lens는 이미 있던 BreadcrumbList가
      // webtoon/video/listen엔 빠져있던 것을 발견해 같은 패턴으로 보강.
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'AI LENS', item: SITE_URL },
          { '@type': 'ListItem', position: 2, name: '웹툰', item: `${SITE_URL}/webtoon` },
          { '@type': 'ListItem', position: 3, name: webtoon.title, item: url },
        ],
      },
    ],
  };
}

export default async function WebtoonViewPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug);
  const webtoon = await findWebtoon(slug);
  const jsonLd = webtoon ? buildJsonLd(webtoon, slug) : null;
  const { episodeLabel, next, prev } = webtoon
    ? await findNeighbors(slug)
    : { episodeLabel: undefined, next: null, prev: null };
  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      <WebtoonViewClient
        slug={slug}
        initialWebtoon={webtoon}
        episodeLabel={episodeLabel}
        nextEpisode={next}
        prevEpisode={prev}
      />
    </>
  );
}
