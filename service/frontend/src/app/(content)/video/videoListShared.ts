import type { CmsVideo } from '@/shared/lib/api/cmsPostsApi';
import { resolveVideo } from '@/shared/lib/videoEmbed';
import { buildSeoDescription } from '@/shared/lib/seo/sanitizeDescription';
import { SITE_URL } from '@/shared/constants/site';

export { SITE_URL };

// /video, /video/page/[n] 공용(2026-08-28, lens/webtoon과 같은 이유 —
// 두 라우트가 메타데이터·JSON-LD·페이지 크기를 반드시 같은 값으로 써야
// 한다). PAGE_SIZE는 VideoListClient.tsx의 기본값과 반드시 일치해야
// 한다(총 페이지 수 계산 기준 — 다르면 generateStaticParams가 실제
// 존재하지 않는 페이지를 만들거나 마지막 페이지를 빠뜨린다).
//
// 원래 이 페이지는 fetchVideos()의 limit=100 캡 덕에 자연히 항목 수가
// 제한돼 페이지네이션 없이 통짜 그리드였다. limit을 1000으로 올리면서
// (cmsPostsApi.ts 참조) 캡이 없어져 발행량이 늘수록 그리드가 무한정
// 길어지는 문제가 생겨 이번에 처음 페이지네이션을 붙인다.
export const VIDEO_LIST_TITLE = '영상으로 보는 이슈';
export const VIDEO_LIST_DESCRIPTION =
  '서울경제 AI LENS가 요즘 경제·사회 이슈를 짧은 영상으로 정리해드려요. 글로 읽기 부담스러운 경제 뉴스도 영상 한 편이면 충분합니다.';
export const VIDEO_PAGE_SIZE = 24;

// 서버 컴포넌트로 SSR — /webtoon, /letters와 같은 이유(SSG/SSR HTML에 실제
// 목록이 바로 박히게). VideoObject 리스트를 CollectionPage JSON-LD로
// 얹어서(2026-08-11, "영상도 검색엔진에 잘 걸리게 해달라"는 요청) 구글이
// 영상 콘텐츠임을 명확히 인식하게 한다.
export function buildVideoJsonLd(items: CmsVideo[]) {
  return {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    '@id': `${SITE_URL}/video#collection`,
    url: `${SITE_URL}/video`,
    name: VIDEO_LIST_TITLE,
    description: VIDEO_LIST_DESCRIPTION,
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
            description: buildSeoDescription(v.excerpt, v.title),
            thumbnailUrl: v.thumbnail_url || resolved?.autoThumbnailUrl || `${SITE_URL}/og-image.png`,
            uploadDate: `${v.date}T07:00:00+09:00`,
            embedUrl: resolved?.embedUrl,
          },
        };
      }),
    },
  };
}
