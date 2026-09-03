import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { fetchHomePlayerPosts, fetchHomePlayerBySlug, type HomePlayerPost } from '@/shared/lib/api/homePlayerApi';
import { resolveVideo, isDirectAudioUrl } from '@/shared/lib/videoEmbed';
import { buildPageTitle } from '@/shared/lib/seo/buildPageTitle';
import { buildSeoDescription } from '@/shared/lib/seo/sanitizeDescription';
import { ListenViewClient } from './ListenViewClient';

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

// 최근 STATIC_PARAMS_LIMIT건만(2026-09-03) — lens/webtoon/video
// [slug]/page.tsx와 같은 이유(EC2 디스크풀 실장애로 확인, lens/[slug]/
// page.tsx 주석 참조). 오래된 오디오는 fetchHomePlayerBySlug 단건
// 조회로 요청 시점에 정상 렌더링(이미 그렇게 돼 있었음).
//
// 2026-09-03 후속(ISR 재설계 감사) — 100은 과하다는 결론, 10으로 더
// 낮춘다. 0으로 완전히 비우지 않는 건 <Link> 프리페치 유지 목적.
const STATIC_PARAMS_LIMIT = 10;

export async function generateStaticParams() {
  const items = await fetchAllListen();
  return items.slice(0, STATIC_PARAMS_LIMIT).map((it) => ({ slug: it.id }));
}

export const dynamicParams = true;
// ⚠️ 리터럴이어야 함(lens/[slug]/page.tsx 주석 참조) — cmsPostsApi.ts의
// CACHE_TTL_FALLBACK_SECONDS와 값이 반드시 같아야 한다.
export const revalidate = 300;

// lens/webtoon의 findLens()/findWebtoon()과 동일한 3회 재시도 패턴
// (2026-09-03, ISR 재설계 감사로 발견 — 여긴 원래 재시도가 없어서 API
// 콜드스타트 같은 일시적 실패가 그대로 "찾을 수 없어요"로 렌더되고 그게
// ISR 캐시에 최대 300초간 박제될 위험이 있었다).
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
  const title = buildPageTitle(item.title, '오디오');
  const description = buildSeoDescription(item.excerpt, '서울경제 AI LENS가 정리한 오디오 뉴스입니다.');
  const url = `${SITE_URL}/listen/${slug}`;
  const resolved = resolveVideo(item.mediaEmbedUrl);
  const image = resolved?.autoThumbnailUrl || `${SITE_URL}/og-image.png`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      type: isDirectAudioUrl(item.mediaEmbedUrl) ? 'music.song' : 'video.other',
      images: [{ url: image, width: 1200, height: 630, alt: item.title }],
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
    name: item.title,
    description: buildSeoDescription(item.excerpt, item.title),
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
        partOfSeries: { '@type': 'PodcastSeries', name: 'AI LENS 오디오 뉴스', url: `${SITE_URL}/listen` },
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
      // 2026-08-21 GEO 재감사 — letters/lens는 이미 있던 BreadcrumbList가
      // webtoon/video/listen엔 빠져있던 것을 발견해 같은 패턴으로 보강.
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'AI LENS', item: SITE_URL },
          { '@type': 'ListItem', position: 2, name: '오디오', item: `${SITE_URL}/listen` },
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
  // 2026-09-03(ISR 재설계) — video/[slug]/page.tsx와 같은 이유로 soft-404
  // 대신 진짜 404를 준다(3회 재시도 후에도 없으면).
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
