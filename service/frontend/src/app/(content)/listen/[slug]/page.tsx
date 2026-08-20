import type { Metadata } from 'next';
import { fetchHomePlayerPosts, fetchHomePlayerBySlug, type HomePlayerPost } from '@/shared/lib/api/homePlayerApi';
import { resolveVideo, isDirectAudioUrl } from '@/shared/lib/videoEmbed';
import { buildPageTitle } from '@/shared/lib/seo/buildPageTitle';
import { ListenViewClient } from './ListenViewClient';

const SITE_URL = 'https://ailens.sedaily.ai';

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

export async function generateStaticParams() {
  const items = await fetchAllListen();
  return items.map((it) => ({ slug: it.id }));
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
  const item = await fetchHomePlayerBySlug(slug);
  if (!item) {
    return { title: '오디오를 찾을 수 없어요', robots: { index: false } };
  }
  const title = buildPageTitle(item.title, '오디오');
  const description = trimDescription(item.excerpt || '서울경제 AI LENS가 정리한 오디오 뉴스입니다.');
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
    '@context': 'https://schema.org',
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    name: item.title,
    description: item.excerpt || item.title,
    inLanguage: 'ko-KR',
    author,
    publisher: { '@id': `${SITE_URL}/#organization` },
  };
  if (isAudio) {
    return {
      ...base,
      '@type': 'PodcastEpisode',
      '@id': `${url}#episode`,
      datePublished: published,
      associatedMedia: { '@type': 'MediaObject', contentUrl: item.mediaEmbedUrl },
      partOfSeries: { '@type': 'PodcastSeries', name: 'AI LENS 오디오 뉴스', url: `${SITE_URL}/listen` },
    };
  }
  return {
    ...base,
    '@type': 'VideoObject',
    '@id': `${url}#video`,
    uploadDate: published,
    thumbnailUrl: resolved?.autoThumbnailUrl || `${SITE_URL}/og-image.png`,
    embedUrl: resolved?.embedUrl,
    contentUrl: item.mediaEmbedUrl,
    isFamilyFriendly: true,
  };
}

export default async function ListenViewPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug);
  const item = await fetchHomePlayerBySlug(slug);
  const jsonLd = item ? buildJsonLd(item, slug) : null;
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
