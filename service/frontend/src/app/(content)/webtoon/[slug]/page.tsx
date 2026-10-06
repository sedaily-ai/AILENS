import { seoHeadline } from '@/shared/lib/content/displayHeadline';
import { mediaSeoExtras } from '@/shared/lib/seo/mediaMeta';
import type { Metadata } from 'next';
import { fetchWebtoons, fetchWebtoonBySlug, type CmsLens, type CmsWebtoon } from '@/shared/lib/api/cmsPostsApi';
import { findLensForChannelSlug } from '@/shared/lib/seo/lensCanonical';
import { buildPageTitle } from '@/shared/lib/seo/buildPageTitle';
import { buildSeoDescription } from '@/shared/lib/seo/sanitizeDescription';
import { WebtoonViewClient } from './WebtoonViewClient';
import { IssueContextSection } from '../../_shared/IssueContextSection';

import { SITE_URL } from '@/shared/constants/site';

// fetchWebtoons() 단발 실패(API Gateway/Lambda 콜드스타트 등)에 바로 "찾을 수 없어요"가 되지 않도록 가벼운 재시도를 둔다.
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

// generateStaticParams를 둔다. 없으면 Next가 이 라우트를 Dynamic 취급해 <Link> 프리페치가 붙지 않는다(letters/[id]/page.tsx와 동일).
// 빌드 시점에는 최근 STATIC_PARAMS_LIMIT건만 정적 생성한다. 전체(수백 건)를 미리 빌드하면 빌드 서버 디스크 부족 위험이 있다(lens/[slug]/page.tsx 참조).
// 목록 API의 limit은 홈 미리보기·/webtoon 목록 때문에 유지하며, 오래된 화는 findWebtoon()의 단건 조회로 요청 시점에 렌더된다.
// generateMetadata·JSON-LD·사이트맵은 이 함수와 무관하다.
const STATIC_PARAMS_LIMIT = 10;

export async function generateStaticParams() {
  const webtoons = await fetchAllWebtoons();
  return webtoons.slice(0, STATIC_PARAMS_LIMIT).map((w) => ({ slug: w.id }));
}

// STATIC_PARAMS_LIMIT 밖 글도 항상 정상 렌더되도록 명시한다(App Router 기본값이 true이며 ISR 의도를 코드로 남긴다).
export const dynamicParams = true;

// fetch 레벨(cmsPostsApi.ts의 cacheOpts)의 안전망을 라우트 레벨에도 명시한다.
// ⚠️ 리터럴이어야 하며(lens/[slug]/page.tsx 참조) cmsPostsApi.ts의 CACHE_TTL_FALLBACK_SECONDS와 값이 같아야 한다.
export const revalidate = 300;

// 목록(fetchAllWebtoons)에서 .find()로 찾으면 목록 상한을 넘는 순간 실제 존재하는 화도 "찾을 수 없어요"가 된다.
// 단건 조회 API(fetchWebtoonBySlug, WebtoonViewClient.tsx도 클라이언트 폴백으로 사용)로 목록 상한과 무관하게 정확히 찾는다.
async function findWebtoon(slug: string): Promise<CmsWebtoon | null> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const result = await fetchWebtoonBySlug(slug);
    if (result) return result;
    if (attempt < 2) await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
  }
  return null;
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
  const headline = seoHeadline(webtoon.title);
  const title = buildPageTitle(headline, '웹툰');
  const description = buildSeoDescription(webtoon.excerpt, '요즘 이슈를 컷으로 이어 보여드려요.');
  // 웹툰 페이지는 자기 자신이 정본이다. 목록 API는 응답 경량화로 panels를 비워 내려주지만 단건 조회에는 컷이 정상으로 오고 서버 HTML에도 컷이 있다.
  // lens 글은 대표 이미지 폴백에만 쓴다.
  const lens = await findLensForChannelSlug(slug);
  const url = `${SITE_URL}/webtoon/${slug}`;
  const image =
    webtoon.cover_image_url || webtoon.panels[0]?.url || lens?.cover_image_url || `${SITE_URL}/og-image.png`;
  const extras = mediaSeoExtras({ headline, description, url, publishedIso: webtoon.published_at || `${webtoon.date}T07:00:00+09:00`, kind: '웹툰' });
  return {
    title,
    description,
    keywords: extras.keywords,
    authors: extras.authors,
    category: extras.category,
    other: extras.other,
    alternates: { canonical: url, languages: extras.languages },
    openGraph: {
      title,
      description,
      url,
      type: 'article',
      publishedTime: webtoon.published_at || `${webtoon.date}T07:00:00+09:00`,
      authors: ['AI LENS 편집팀'],
      section: webtoon.category || '웹툰',
      tags: extras.keywords,
      images: [{ url: image, width: 1200, height: 800, alt: headline }],
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

function buildJsonLd(webtoon: CmsWebtoon, slug: string, lens: CmsLens | null) {
  // generateMetadata와 같은 정본 URL(lens 페이지)을 쓴다 — 구조화 데이터의 url이 canonical과 어긋나지 않게.
  const url = `${SITE_URL}/webtoon/${slug}`;
  const published = webtoon.published_at || `${webtoon.date}T07:00:00+09:00`;
  const image =
    webtoon.cover_image_url || webtoon.panels[0]?.url || lens?.cover_image_url || `${SITE_URL}/og-image.png`;
  // 컷마다 별도 이미지+대사가 있으므로 panels 전체를 캡션 딸린 ImageObject 배열로, 캡션을 이어붙인 텍스트를 articleBody로 노출한다.
  // 검색·AI 답변엔진이 이 페이지를 이미지 1장짜리 기사로 오해하지 않게 한다(페이지에는 panel.caption이 이미 텍스트로 렌더됨 — WebtoonViewClient.tsx).
  const panelImages = webtoon.panels.length > 0
    ? webtoon.panels.map((p, i) => ({
        '@type': 'ImageObject' as const,
        url: p.url,
        caption: p.caption || `${webtoon.title} 컷 ${i + 1}`,
        position: i + 1,
      }))
    : [{ '@type': 'ImageObject' as const, url: image, width: 1200, height: 800 }];
  const articleBody = webtoon.panels
    .map((p) => p.caption)
    .filter(Boolean)
    .join('\n\n');
  return {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Article',
        '@id': `${url}#article`,
        mainEntityOfPage: { '@type': 'WebPage', '@id': url },
        headline: seoHeadline(webtoon.title),
        description: webtoon.excerpt,
        keywords: [...new Set([seoHeadline(webtoon.title), '웹툰', '경제 웹툰', '오늘의 이슈', 'AI LENS', '서울경제'])],
        genre: '웹툰',
        articleSection: '웹툰',
        thumbnailUrl: image,
        copyrightHolder: { '@id': `${SITE_URL}/#organization` },
        copyrightYear: Number(webtoon.date.slice(0, 4)),
        creditText: '서울경제신문 AI LENS',
        ...(lens?.source_url ? { isBasedOn: { '@type': 'NewsArticle', url: lens.source_url, publisher: { '@id': `${SITE_URL}/#organization` } } } : {}),
        potentialAction: { '@type': 'ReadAction', target: [url] },
        ...(articleBody ? { articleBody } : {}),
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
        associatedMedia: panelImages,
        isAccessibleForFree: true,
      },
      // BreadcrumbList — letters/lens와 같은 패턴.
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'AI LENS', item: SITE_URL },
          { '@type': 'ListItem', position: 2, name: '최신 뉴스', item: `${SITE_URL}/lens` },
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
  // 같은 이슈의 lens 글(슬러그 동일) — 텍스트 보강(IssueContextSection)과 정본 URL 계산에 함께 쓴다.
  const lens = webtoon ? await findLensForChannelSlug(slug) : null;
  const jsonLd = webtoon ? buildJsonLd(webtoon, slug, lens) : null;
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
        supplement={<IssueContextSection lens={lens} format="웹툰" tone="dark" />}
      />
    </>
  );
}
