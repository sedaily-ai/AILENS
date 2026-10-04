import type { Metadata } from 'next';
import { fetchWebtoons, toWebtoonSeriesListPayload, type CmsWebtoon } from '@/shared/lib/api/cmsPostsApi';
import { buildPageTitle } from '@/shared/lib/seo/buildPageTitle';
import { buildSeoDescription } from '@/shared/lib/seo/sanitizeDescription';
import { groupIntoSeries, findSeriesBySlug, type WebtoonSeries } from '@/shared/lib/webtoonSeries';
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

// SeriesCard(webtoonSeriesUi.tsx)가 /webtoon/series/{slug}로 링크하는데
// 그 라우트 자체가 없어서 404였다(2026-08-24 발견) — generateStaticParams로
// 실제 페이지를 만든다. [slug]/page.tsx와 동일 이유: 이게 없으면 이 라우트가
// ƒ Dynamic 취급돼 <Link> 프리페치가 안 붙는다.
//
// 2026-09-03(ISR 재설계 감사로 발견) — 이 라우트만 2026-09-03 오전의
// STATIC_PARAMS_LIMIT 수정에서 빠져 있었다. series_title이 없는 편은
// 전부 자기 자신만의 "단편" 시리즈가 되므로([slug]/page.tsx와 별개로)
// 사실상 웹툰 편 수만큼 무제한으로 정적 페이지가 쌓이고 있었다(수백 개
// 추정, 오늘 디스크풀 장애 재현 가능성이 있던 미해결 지점). [slug]/
// page.tsx와 동일한 상한을 적용 — 최근 갱신된 시리즈 STATIC_PARAMS_LIMIT
// 개만 미리 빌드, 나머지는 findSeries()의 요청 시점 조회로.
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
  // panels(컷 이미지+캡션 배열)는 이 페이지가 안 읽는다 — 표지 썸네일만
  // 쓴다(SeriesViewClient.tsx 참조). 회차 번호 매김은 전체 목록 개수에
  // 의존하므로 slice는 안 하고 무거운 필드만 뺀다(toWebtoonSeriesListPayload
  // 주석 참조) — 이게 최대 1000건짜리 페이지 여러 개(시리즈당 하나)에
  // 통째로 심기던 오늘 장애급 페이로드 폭증의 실질적 원인이었다.
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
