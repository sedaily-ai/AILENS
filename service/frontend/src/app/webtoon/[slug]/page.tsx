import type { Metadata } from 'next';
import { fetchWebtoons, type CmsWebtoon } from '@/shared/lib/cmsPostsApi';
import { WebtoonViewClient } from './WebtoonViewClient';

const SITE_URL = 'https://ailens.sedaily.ai';

// 경로 기반으로 전환(2026-08-07) — 예전엔 /webtoon/view?id= 로 클라이언트에서만
// 식별했는데(정적 export + Next 클라이언트 라우팅 불일치가 그날의 CloudFront
// _rsc 버그 원인), 이제 슬러그를 실제 경로 세그먼트로 써서 빌드타임에 완성된
// HTML을 굽는다. /letters/[id] 와 동일 패턴 — 실제 데이터로 정적 생성 +
// generateMetadata 로 OG 태그까지 채운다(이번엔 처음부터 body 텍스트를
// initialWebtoon prop 으로 내려서 letters 쪽에서 겪은 "mounted 게이트가
// SSG 출력을 비워버리는" 문제를 재현하지 않는다).
// 빌드 시 워커 여러 개(9개)가 같은 API에 동시에 fetch 를 쏘다 보니 개별 호출이
// 가끔 실패하는 걸 실측 확인(2026-08-07) — 재시도 없이 빈 배열로 죽으면 그
// 페이지만 "찾을 수 없어요"로 정적 생성돼버린다. 가벼운 재시도로 방지.
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

export async function generateStaticParams() {
  const webtoons = await fetchAllWebtoons();
  // output:'export'는 동적 라우트에 param이 0개면 빌드 자체를 실패시킨다
  // (letters/[id]/page.tsx와 동일 이슈) — 웹툰이 하나도 없는 기간에도 빌드가
  // 죽지 않게 최소 1개는 확보한다. 실존하지 않는 slug라 findWebtoon()이 null
  // 반환 → "웹툰을 찾을 수 없어요"로 정상 degrade.
  if (webtoons.length === 0) return [{ slug: 'placeholder' }];
  return webtoons.map((w) => ({ slug: w.id }));
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
  const title = `${webtoon.title} — AI LENS 웹툰`;
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
