import type { Metadata } from 'next';
import { fetchVideos, type CmsVideo } from '@/shared/lib/api/cmsPostsApi';
import { resolveVideo } from '@/shared/lib/videoEmbed';
import { VideoListClient } from './VideoListClient';

import { SITE_URL } from '@/shared/constants/site';
const TITLE = '영상으로 보는 이슈';
const DESCRIPTION = '서울경제 AI LENS가 요즘 경제·사회 이슈를 짧은 영상으로 정리해드려요. 글로 읽기 부담스러운 경제 뉴스도 영상 한 편이면 충분합니다.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  // GEO 감사(2026-08-12, letters/page.tsx 주석 참조) — 키워드 커버리지 확장.
  keywords: ['영상', '뉴스 영상', '경제 뉴스 영상', '숏폼 뉴스', '경제 유튜브', '시사 영상', 'AI LENS', '서울경제'],
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
    keywords: '영상, 뉴스 영상, 경제 뉴스 영상, 숏폼 뉴스, 경제 유튜브, 시사 영상, 서울경제',
    inLanguage: 'ko-KR',
    isPartOf: { '@id': `${SITE_URL}/#website` },
    publisher: { '@id': `${SITE_URL}/#organization` },
    author: {
      '@type': 'Organization',
      name: 'AI LENS 편집팀',
      description: '서울경제신문 기자들이 취재한 원본 기사를 바탕으로 AI가 요약·재구성한 초안을 작성하고, 편집팀이 검수해 발행합니다.',
      url: `${SITE_URL}/about`,
      parentOrganization: { '@id': `${SITE_URL}/#organization` },
    },
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
