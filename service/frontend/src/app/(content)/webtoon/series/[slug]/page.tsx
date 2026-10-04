import type { Metadata } from 'next';
import { fetchWebtoons, toWebtoonSeriesListPayload, type CmsWebtoon } from '@/shared/lib/api/cmsPostsApi';
import { buildPageTitle } from '@/shared/lib/seo/buildPageTitle';
import { buildSeoDescription } from '@/shared/lib/seo/sanitizeDescription';
import { groupIntoSeries, findSeriesBySlug, type WebtoonSeries } from '@/shared/lib/content/webtoonSeries';
import { SeriesViewClient } from './SeriesViewClient';

import { SITE_URL } from '@/shared/constants/site';

// 경로 기반, [slug]/page.tsx(개별 편)와 동일 이유·동일 재시도 패턴.
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

// SeriesCard(webtoonSeriesUi.tsx)가 /webtoon/series/{slug}로 링크하므로 generateStaticParams로 실제 페이지를 만든다. 없으면 이 라우트가 Dynamic 취급되어 <Link> 프리페치가 붙지 않는다([slug]/page.tsx와 동일).
// series_title이 없는 편은 각각 단편 시리즈가 되어 정적 페이지가 편 수만큼 늘어난다. 최근 갱신된 시리즈 STATIC_PARAMS_LIMIT개만 미리 빌드하고 나머지는 findSeries()의 요청 시점 조회로 처리한다([slug]/page.tsx와 동일 상한).
const STATIC_PARAMS_LIMIT = 10;

export async function generateStaticParams() {
  const webtoons = await fetchAllWebtoons();
  const series = groupIntoSeries(webtoons);
  return series.slice(0, STATIC_PARAMS_LIMIT).map((s) => ({ slug: s.slug }));
}

export const dynamicParams = true;
// ⚠️ 리터럴이어야 함(lens/[slug]/page.tsx 주석 참조) — cmsPostsApi.ts의
// CACHE_TTL_FALLBACK_SECONDS와 값이 반드시 같아야 한다.
export const revalidate = 300;

async function findSeries(slug: string): Promise<WebtoonSeries | null> {
  const webtoons = await fetchAllWebtoons();
  return findSeriesBySlug(webtoons, slug);
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug);
  const series = await findSeries(slug);
  if (!series) {
    return { title: '시리즈를 찾을 수 없어요', robots: { index: false } };
  }
  const title = buildPageTitle(series.title, '웹툰 시리즈');
  const description = buildSeoDescription(
    series.episodes[0]?.excerpt,
    `${series.title} — 총 ${series.episodes.length}화, 요즘 이슈를 컷으로 이어 보여드려요.`,
  );
  const url = `${SITE_URL}/webtoon/series/${slug}`;
  const image = series.coverImageUrl || `${SITE_URL}/og-image.png`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      type: 'website',
      images: [{ url: image, width: 1200, height: 800, alt: series.title }],
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

function buildJsonLd(series: WebtoonSeries, slug: string) {
  const url = `${SITE_URL}/webtoon/series/${slug}`;
  const image = series.coverImageUrl || `${SITE_URL}/og-image.png`;
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        '@id': `${url}#collection`,
        url,
        name: series.title,
        inLanguage: 'ko-KR',
        isPartOf: { '@id': `${SITE_URL}/#website` },
        publisher: { '@id': `${SITE_URL}/#organization` },
        image: { '@type': 'ImageObject', url: image, width: 1200, height: 800 },
        mainEntity: {
          '@type': 'ItemList',
          itemListElement: series.episodes.map((ep, i) => ({
            '@type': 'ListItem',
            position: series.episodes.length - i,
            url: `${SITE_URL}/webtoon/${encodeURIComponent(ep.id)}`,
            name: ep.title,
          })),
        },
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'AI LENS', item: SITE_URL },
          { '@type': 'ListItem', position: 2, name: '최신 뉴스', item: `${SITE_URL}/lens` },
          { '@type': 'ListItem', position: 3, name: series.title, item: url },
        ],
      },
    ],
  };
}

export default async function WebtoonSeriesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug);
  const [webtoons, series] = await Promise.all([fetchAllWebtoons(), findSeries(slug)]);
  const jsonLd = series ? buildJsonLd(series, slug) : null;
  // panels(컷 이미지+캡션 배열)는 이 페이지가 읽지 않는다(표지 썸네일만 사용 — SeriesViewClient.tsx). 회차 번호 매김이 전체 목록 개수에 의존하므로 slice 없이 무거운 필드만 뺀다(toWebtoonSeriesListPayload 참조).
  // 최대 1000건 목록을 시리즈 페이지마다 통째로 심으면 페이로드가 폭증한다.
  const webtoonsForClient = toWebtoonSeriesListPayload(webtoons);
  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      <SeriesViewClient slug={slug} initialItems={webtoonsForClient} />
    </>
  );
}
