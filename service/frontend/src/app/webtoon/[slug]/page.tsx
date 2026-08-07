import type { Metadata } from 'next';
import { fetchWebtoons, type CmsWebtoon } from '@/shared/lib/cmsPostsApi';
import { WebtoonViewClient } from './WebtoonViewClient';

const SITE_URL = 'https://ailens.sedaily.ai';

// 경로 기반(2026-08-07) 그대로, SSR(2026-08-08)로 렌더링만 요청 시점으로 바뀜 —
// generateStaticParams 없음, 매 요청 서버가 findWebtoon()을 호출한다.
// fetchWebtoons() 단발 실패(API Gateway/Lambda 콜드스타트 등)에 바로
// "찾을 수 없어요"로 떨어지지 않도록 가벼운 재시도를 유지한다.
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

async function findWebtoon(slug: string): Promise<CmsWebtoon | null> {
  const webtoons = await fetchAllWebtoons();
  return webtoons.find((w) => w.id === slug) ?? null;
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
  // layout.tsx의 title.template("%s | AI LENS")이 자동으로 브랜드명을 붙인다 —
  // 여기서 또 붙이면 브랜드명이 중복된다(2026-08-08 발견, letters/[id]와 동일 버그).
  const title = `${webtoon.title} — 웹툰`;
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
      name: 'AI LENS',
    },
    publisher: { '@id': `${SITE_URL}/#organization` },
    image: { '@type': 'ImageObject', url: image, width: 1200, height: 800 },
    isAccessibleForFree: true,
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
  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      <WebtoonViewClient slug={slug} initialWebtoon={webtoon} />
    </>
  );
}
