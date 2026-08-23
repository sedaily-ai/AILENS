import type { Metadata } from 'next';
import { fetchVideos, fetchVideoBySlug, type CmsVideo } from '@/shared/lib/api/cmsPostsApi';
import { resolveVideo } from '@/shared/lib/videoEmbed';
import { buildPageTitle } from '@/shared/lib/seo/buildPageTitle';
import { VideoViewClient } from './VideoViewClient';

import { SITE_URL } from '@/shared/constants/site';

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
  const title = buildPageTitle(video.title, '영상');
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
    '@graph': [
      {
        '@type': 'VideoObject',
        '@id': `${url}#video`,
        mainEntityOfPage: { '@type': 'WebPage', '@id': url },
        name: video.title,
        description: video.excerpt || video.title,
        thumbnailUrl: image,
        uploadDate: published,
        inLanguage: 'ko-KR',
        embedUrl: resolved?.embedUrl,
        // contentUrl 보강(2026-08-14, GEO 감사) — embedUrl은 유튜브/네이버TV만
        // resolveVideo()가 채워주는데, 그 외 플랫폼이면 둘 다 비어 구글이 최소
        // 요구하는 "재생 가능 URL" 신호가 아예 없었다. video_url은 admin이 항상
        // 입력하는 필드라 무조건 채울 수 있다 — duration은 정확한 값을 얻을
        // 소스가 없어(YouTube Data API 키 연동 필요) 추측값을 넣지 않는다.
        contentUrl: video.video_url,
        author: {
          '@type': 'Organization',
          name: 'AI LENS 편집팀',
          description:
            '서울경제신문 기자들이 취재한 원본 기사를 바탕으로 AI가 요약·재구성한 초안을 작성하고, 편집팀이 검수해 발행합니다.',
          url: `${SITE_URL}/about`,
          parentOrganization: { '@id': `${SITE_URL}/#organization` },
        },
        publisher: { '@id': `${SITE_URL}/#organization` },
        isFamilyFriendly: true,
      },
      // 2026-08-21 GEO 재감사 — letters/lens는 이미 있던 BreadcrumbList가
      // webtoon/video/listen엔 빠져있던 것을 발견해 같은 패턴으로 보강.
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'AI LENS', item: SITE_URL },
          { '@type': 'ListItem', position: 2, name: '영상', item: `${SITE_URL}/video` },
          { '@type': 'ListItem', position: 3, name: video.title, item: url },
        ],
      },
    ],
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
