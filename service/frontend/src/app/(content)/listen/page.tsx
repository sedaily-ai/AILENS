import type { Metadata } from 'next';
import { fetchHomePlayerPosts, type HomePlayerPost } from '@/shared/lib/api/homePlayerApi';
import { resolveVideo, isDirectAudioUrl } from '@/shared/lib/videoEmbed';
import { ListenListClient } from './ListenListClient';

import { SITE_URL } from '@/shared/constants/site';
const TITLE = '오늘의 뉴스를 귀로';
const DESCRIPTION = '서울경제 AI LENS가 정리한 오늘의 경제 이슈를 오디오로 들어보세요. 팟캐스트와 영상을 한 재생목록으로 모았습니다.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  // GEO 감사(2026-08-21) — 이 재생목록이 홈 하단 미니 플레이어에만 있어서
  // 고유 URL이 없어 검색엔진에 전혀 안 걸렸다는 걸 사용자가 직접 지적하며
  // 신설. /video, /webtoon과 같은 패턴(page.tsx 참조).
  keywords: ['오디오 뉴스', '경제 팟캐스트', '뉴스 듣기', '경제 뉴스 오디오', 'AI LENS', '서울경제'],
  alternates: { canonical: `${SITE_URL}/listen` },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `${SITE_URL}/listen`,
    type: 'website',
    images: [{ url: `${SITE_URL}/og-image.png`, width: 1200, height: 630, alt: 'AI LENS 오디오' }],
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

// video/page.tsx와 같은 이유의 CollectionPage + ItemList JSON-LD. 항목마다
// mp3 직접 파일(PodcastEpisode)과 YouTube 링크(VideoObject)가 섞여 있어
// 타입을 하나로 못 고정한다 — 실제 파일 형태를 보고 그때그때 고른다.
function buildJsonLd(items: HomePlayerPost[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': `${SITE_URL}/listen#collection`,
    url: `${SITE_URL}/listen`,
    name: TITLE,
    description: DESCRIPTION,
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
      itemListElement: items.slice(0, 20).map((it, i) => {
        const isAudio = isDirectAudioUrl(it.mediaEmbedUrl);
        const resolved = resolveVideo(it.mediaEmbedUrl);
        return {
          '@type': 'ListItem',
          position: i + 1,
          url: `${SITE_URL}/listen/${it.id}`,
          item: isAudio
            ? {
                '@type': 'PodcastEpisode',
                name: it.title,
                description: it.excerpt || it.title,
                datePublished: it.date ? `${it.date}T07:00:00+09:00` : undefined,
                associatedMedia: { '@type': 'MediaObject', contentUrl: it.mediaEmbedUrl },
              }
            : {
                '@type': 'VideoObject',
                name: it.title,
                description: it.excerpt || it.title,
                uploadDate: it.date ? `${it.date}T07:00:00+09:00` : undefined,
                embedUrl: resolved?.embedUrl,
                thumbnailUrl: resolved?.autoThumbnailUrl || `${SITE_URL}/og-image.png`,
              },
        };
      }),
    },
  };
}

export default async function ListenListPage() {
  const items = await fetchHomePlayerPosts();
  const jsonLd = buildJsonLd(items);
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ListenListClient initialItems={items} />
    </>
  );
}
