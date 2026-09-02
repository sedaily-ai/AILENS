import type { HomePlayerPost } from '@/shared/lib/api/homePlayerApi';
import { resolveVideo, isDirectAudioUrl } from '@/shared/lib/videoEmbed';
import { buildSeoDescription } from '@/shared/lib/seo/sanitizeDescription';
import { SITE_URL } from '@/shared/constants/site';

export { SITE_URL };

// /listen, /listen/page/[n] 공용(2026-08-28, video/videoListShared.ts와
// 같은 이유). PAGE_SIZE는 ListenListClient.tsx의 기본값과 반드시 일치해야
// 한다.
export const LISTEN_LIST_TITLE = '오늘의 뉴스를 귀로';
export const LISTEN_LIST_DESCRIPTION =
  '서울경제 AI LENS가 정리한 오늘의 경제 이슈를 오디오로 들어보세요. 팟캐스트와 영상을 한 재생목록으로 모았습니다.';
export const LISTEN_PAGE_SIZE = 30;

// video/page.tsx와 같은 이유의 CollectionPage + ItemList JSON-LD. 항목마다
// mp3 직접 파일(PodcastEpisode)과 YouTube 링크(VideoObject)가 섞여 있어
// 타입을 하나로 못 고정한다 — 실제 파일 형태를 보고 그때그때 고른다.
export function buildListenJsonLd(items: HomePlayerPost[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': `${SITE_URL}/listen#collection`,
    url: `${SITE_URL}/listen`,
    name: LISTEN_LIST_TITLE,
    description: LISTEN_LIST_DESCRIPTION,
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
                description: buildSeoDescription(it.excerpt, it.title),
                datePublished: it.date ? `${it.date}T07:00:00+09:00` : undefined,
                associatedMedia: { '@type': 'MediaObject', contentUrl: it.mediaEmbedUrl },
              }
            : {
                '@type': 'VideoObject',
                name: it.title,
                description: buildSeoDescription(it.excerpt, it.title),
                uploadDate: it.date ? `${it.date}T07:00:00+09:00` : undefined,
                embedUrl: resolved?.embedUrl,
                thumbnailUrl: resolved?.autoThumbnailUrl || `${SITE_URL}/og-image.png`,
              },
        };
      }),
    },
  };
}
