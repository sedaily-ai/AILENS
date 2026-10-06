import { seoHeadline } from '@/shared/lib/content/displayHeadline';
import { mediaSeoExtras } from '@/shared/lib/seo/mediaMeta';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { fetchHomePlayerPosts, fetchHomePlayerBySlug, type HomePlayerPost } from '@/shared/lib/api/homePlayerApi';
import { resolveVideo, isDirectAudioUrl } from '@/shared/lib/media/videoEmbed';
import { buildPageTitle } from '@/shared/lib/seo/buildPageTitle';
import { buildSeoDescription } from '@/shared/lib/seo/sanitizeDescription';
import { ListenViewClient } from './ListenViewClient';
import { canonicalFromLens, findLensForChannelSlug } from '@/shared/lib/seo/lensCanonical';

import { SITE_URL } from '@/shared/constants/site';

// video/[slug]/page.tsx와 같은 이유의 가벼운 재시도.
async function fetchAllListen(): Promise<HomePlayerPost[]> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const result = await fetchHomePlayerPosts();
      if (result.length > 0) return result;
    } catch {
      // 다음 시도로.
    }
    if (attempt < 2) await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
  }
  return [];
}

// 빌드 시점에는 최근 STATIC_PARAMS_LIMIT건만 정적 생성한다(lens/webtoon/video [slug]/page.tsx와 같은 이유 — lens/[slug]/page.tsx 참조). 오래된 오디오는 fetchHomePlayerBySlug 단건 조회로 요청 시점에 렌더된다.
// 0으로 비우지 않는 것은 <Link> 프리페치를 유지하기 위해서다.
const STATIC_PARAMS_LIMIT = 10;

export async function generateStaticParams() {
  const items = await fetchAllListen();
  return items.slice(0, STATIC_PARAMS_LIMIT).map((it) => ({ slug: it.id }));
}

export const dynamicParams = true;
// ⚠️ 리터럴이어야 함(lens/[slug]/page.tsx 주석 참조) — cmsPostsApi.ts의
// CACHE_TTL_FALLBACK_SECONDS와 값이 반드시 같아야 한다.
export const revalidate = 300;

// lens/webtoon의 findLens()/findWebtoon()과 동일한 3회 재시도 패턴. 재시도가 없으면 API 콜드스타트 같은 일시적 실패가 "찾을 수 없어요"로 렌더되어 ISR 캐시에 최대 300초간 남는다.
async function findListen(slug: string): Promise<HomePlayerPost | null> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const result = await fetchHomePlayerBySlug(slug);
    if (result) return result;
    if (attempt < 2) await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
  }
  return null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug);
  const item = await findListen(slug);
  if (!item) {
    return { title: '오디오를 찾을 수 없어요', robots: { index: false } };
  }
  const headline = seoHeadline(item.title);
  const title = buildPageTitle(headline, '오디오');
  const description = buildSeoDescription(item.excerpt, '서울경제 AI LENS가 정리한 오디오 뉴스입니다.');
  // 정본은 같은 기사의 lens 페이지이다(본문이 기사 페이지와 대부분 중복되는 페이지).
  const lensForCanonical = await findLensForChannelSlug(slug);
  const url = canonicalFromLens(lensForCanonical, `/listen/${slug}`);
  const resolved = resolveVideo(item.mediaEmbedUrl);
  const image = resolved?.autoThumbnailUrl || lensForCanonical?.cover_image_url || `${SITE_URL}/og-image.png`;
  const extras = mediaSeoExtras({ headline, description, url, publishedIso: item.date ? `${item.date}T07:00:00+09:00` : new Date().toISOString(), kind: '오디오' });
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
      type: isDirectAudioUrl(item.mediaEmbedUrl) ? 'music.song' : 'video.other',
      images: [{ url: image, width: 1200, height: 630, alt: headline }],
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

function buildJsonLd(item: HomePlayerPost, slug: string) {
  const url = `${SITE_URL}/listen/${slug}`;
  const published = item.date ? `${item.date}T07:00:00+09:00` : undefined;
  const isAudio = isDirectAudioUrl(item.mediaEmbedUrl);
  const resolved = resolveVideo(item.mediaEmbedUrl);
  const author = {
    '@type': 'Organization',
    name: 'AI LENS 편집팀',
    description: '서울경제신문 기자들이 취재한 원본 기사를 바탕으로 AI가 요약·재구성한 초안을 작성하고, 편집팀이 검수해 발행합니다.',
    url: `${SITE_URL}/about`,
    parentOrganization: { '@id': `${SITE_URL}/#organization` },
  };
  const base = {
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    name: seoHeadline(item.title),
    description: buildSeoDescription(item.excerpt, seoHeadline(item.title)),
    keywords: [...new Set([seoHeadline(item.title), '오디오', '경제 팟캐스트', '오늘의 이슈', 'AI LENS', '서울경제'])],
    copyrightHolder: { '@id': `${SITE_URL}/#organization` },
    creditText: '서울경제신문 AI LENS',
    inLanguage: 'ko-KR',
    author,
    publisher: { '@id': `${SITE_URL}/#organization` },
  };
  const mainNode = isAudio
    ? {
        ...base,
        '@type': 'PodcastEpisode',
        '@id': `${url}#episode`,
        datePublished: published,
        associatedMedia: { '@type': 'MediaObject', contentUrl: item.mediaEmbedUrl },
        partOfSeries: { '@type': 'PodcastSeries', name: 'AI LENS 오디오 뉴스', url: `${SITE_URL}/lens` },
      }
    : {
        ...base,
        '@type': 'VideoObject',
        '@id': `${url}#video`,
        uploadDate: published,
        thumbnailUrl: resolved?.autoThumbnailUrl || `${SITE_URL}/og-image.png`,
        embedUrl: resolved?.embedUrl,
        contentUrl: item.mediaEmbedUrl,
        isFamilyFriendly: true,
      };
  return {
    '@context': 'https://schema.org',
    '@graph': [
      mainNode,
      // BreadcrumbList — letters/lens와 같은 패턴.
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'AI LENS', item: SITE_URL },
          { '@type': 'ListItem', position: 2, name: '최신 뉴스', item: `${SITE_URL}/lens` },
          { '@type': 'ListItem', position: 3, name: item.title, item: url },
        ],
      },
    ],
  };
}

export default async function ListenViewPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug);
  const item = await findListen(slug);
  // video/[slug]/page.tsx와 같은 이유로 soft-404 대신 실제 404를 준다(3회 재시도 후에도 없으면).
  if (!item) {
    notFound();
  }
  const jsonLd = buildJsonLd(item, slug);
  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      <ListenViewClient slug={slug} initialItem={item} />
    </>
  );
}
