import type { Metadata } from 'next';
import { fetchVideos, fetchVideoBySlug, type CmsVideo } from '@/shared/lib/cmsPostsApi';
import { resolveVideo } from '@/shared/lib/videoEmbed';
import { VideoViewClient } from './VideoViewClient';

const SITE_URL = 'https://ailens.sedaily.ai';

// webtoon/[slug]/page.tsx와 같은 이유의 가벼운 재시도 — fetchVideos() 단발
// 실패(콜드스타트 등)에 바로 "찾을 수 없어요"로 떨어지지 않게.
async function fetchAllVideos(): Promise<CmsVideo[]> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const result = await fetchVideos();
      if (result.length > 0) return result;
    } catch {
      // 다음 시도로.
    }
    if (attempt < 2) await new Promise((r) => setTimeout(r, 300 * (attempt + 1)));
  }
  return [];
}

export async function generateStaticParams() {
  const videos = await fetchAllVideos();
  return videos.map((v) => ({ slug: v.id }));
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
  const video = await fetchVideoBySlug(slug);
  if (!video) {
    return { title: '영상을 찾을 수 없어요', robots: { index: false } };
  }
  // layout.tsx의 title.template("%s | AI LENS")이 브랜드명을 자동으로 붙인다.
  const title = `${video.title} — 영상`;
  const description = trimDescription(video.excerpt || '서울경제 AI LENS가 정리한 이슈 영상입니다.');
  const url = `${SITE_URL}/video/${slug}`;
  const resolved = resolveVideo(video.video_url);
  const image = video.thumbnail_url || resolved?.autoThumbnailUrl || `${SITE_URL}/og-image.png`;
  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      type: 'video.other',
      images: [{ url: image, width: 1200, height: 630, alt: video.title }],
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

function buildJsonLd(video: CmsVideo, slug: string) {
  const url = `${SITE_URL}/video/${slug}`;
  const published = `${video.date}T07:00:00+09:00`;
  const resolved = resolveVideo(video.video_url);
  const image = video.thumbnail_url || resolved?.autoThumbnailUrl || `${SITE_URL}/og-image.png`;
  return {
    '@context': 'https://schema.org',
    '@type': 'VideoObject',
    '@id': `${url}#video`,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    name: video.title,
    description: video.excerpt || video.title,
    thumbnailUrl: image,
    uploadDate: published,
    inLanguage: 'ko-KR',
    embedUrl: resolved?.embedUrl,
    publisher: { '@id': `${SITE_URL}/#organization` },
    isFamilyFriendly: true,
  };
}

export default async function VideoViewPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug);
  const video = await fetchVideoBySlug(slug);
  const jsonLd = video ? buildJsonLd(video, slug) : null;
  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      <VideoViewClient slug={slug} initialVideo={video} />
    </>
  );
}
