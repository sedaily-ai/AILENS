import type { Metadata } from 'next';
import { fetchVideos, type CmsVideo } from '@/shared/lib/cmsPostsApi';
import { resolveVideo } from '@/shared/lib/videoEmbed';
import { VideoListClient } from './VideoListClient';

const SITE_URL = 'https://ailens.sedaily.ai';
const TITLE = '영상으로 보는 이슈';
const DESCRIPTION = '서울경제 AI LENS가 요즘 경제·사회 이슈를 짧은 영상으로 정리해드려요.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  keywords: ['영상', '뉴스 영상', '경제 뉴스 영상', 'AI LENS', '서울경제'],
  alternates: { canonical: `${SITE_URL}/video` },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `${SITE_URL}/video`,
    type: 'website',
    images: [{ url: `${SITE_URL}/og-image.png`, width: 1200, height: 630, alt: 'AI LENS 영상' }],
    locale: 'ko_KR',
    siteName: 'AI LENS — 서울경제',
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: [`${SITE_URL}/og-image.png`],
  },
};

// 서버 컴포넌트로 SSR — /webtoon, /letters와 같은 이유(SSG/SSR HTML에 실제
// 목록이 바로 박히게). VideoObject 리스트를 CollectionPage JSON-LD로
// 얹어서(2026-08-11, "영상도 검색엔진에 잘 걸리게 해달라"는 요청) 구글이
// 영상 콘텐츠임을 명확히 인식하게 한다.
function buildJsonLd(items: CmsVideo[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': `${SITE_URL}/video#collection`,
    url: `${SITE_URL}/video`,
    name: TITLE,
    description: DESCRIPTION,
    inLanguage: 'ko-KR',
    isPartOf: { '@id': `${SITE_URL}/#website` },
    publisher: { '@id': `${SITE_URL}/#organization` },
    mainEntity: {
      '@type': 'ItemList',
      itemListElement: items.slice(0, 20).map((v, i) => {
        const resolved = resolveVideo(v.video_url);
        return {
          '@type': 'ListItem',
          position: i + 1,
          url: `${SITE_URL}/video/${v.id}`,
          item: {
            '@type': 'VideoObject',
            name: v.title,
            description: v.excerpt || v.title,
            thumbnailUrl: v.thumbnail_url || resolved?.autoThumbnailUrl || `${SITE_URL}/og-image.png`,
            uploadDate: `${v.date}T07:00:00+09:00`,
            embedUrl: resolved?.embedUrl,
          },
        };
      }),
    },
  };
}

export default async function VideoListPage() {
  const items = await fetchVideos();
  const jsonLd = buildJsonLd(items);
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <VideoListClient initialItems={items} />
    </>
  );
}
