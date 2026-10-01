import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { fetchVideos, fetchVideoBySlug, fetchLensBySlug, type CmsLens, type CmsVideo } from '@/shared/lib/api/cmsPostsApi';
import { resolveVideo } from '@/shared/lib/videoEmbed';
import { buildPageTitle } from '@/shared/lib/seo/buildPageTitle';
import { buildSeoDescription } from '@/shared/lib/seo/sanitizeDescription';
import { VideoViewClient } from './VideoViewClient';
import { IssueContextSection } from '../../_shared/IssueContextSection';

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

// 최근 STATIC_PARAMS_LIMIT건만(2026-09-03) — lens/webtoon [slug]/page.tsx와
// 같은 이유(EC2 디스크풀 실장애로 확인, lens/[slug]/page.tsx 주석 참조).
// fetchVideos()가 limit=1000이라 그대로 두면 여기서도 전체를 정적
// 페이지로 미리 빌드한다 — 목록 API의 limit은 그대로, 미리 빌드하는
// 개수만 최근 것으로 제한. 오래된 영상은 fetchVideoBySlug 단건 조회로
// 요청 시점에 정상 렌더링(generateMetadata·기본 export 둘 다 이미
// fetchVideoBySlug를 직접 쓰고 있었음 — lens/webtoon과 달리 처음부터
// 안전했던 부분).
// 2026-09-03 후속(ISR 재설계 감사) — generateMetadata·JSON-LD·사이트맵이
// 이미 이 함수와 무관하다는 게 확인돼(위 주석 참조) 100은 과하다는 결론
// — 10으로 더 낮춘다. 0으로 완전히 비우지 않는 건 lens/webtoon과 같은
// 이유(<Link> 프리페치 유지, 라우트가 ƒ Dynamic으로 바뀌는 것 방지).
const STATIC_PARAMS_LIMIT = 10;

export async function generateStaticParams() {
  const videos = await fetchAllVideos();
  return videos.slice(0, STATIC_PARAMS_LIMIT).map((v) => ({ slug: v.id }));
}

export const dynamicParams = true;
// ⚠️ 리터럴이어야 함(lens/[slug]/page.tsx 주석 참조) — cmsPostsApi.ts의
// CACHE_TTL_FALLBACK_SECONDS와 값이 반드시 같아야 한다.
export const revalidate = 300;

// lens/webtoon의 findLens()/findWebtoon()과 동일한 3회 재시도 패턴
// (2026-09-03, ISR 재설계 감사로 발견 — 여긴 원래 재시도가 없어서 API
// 콜드스타트 같은 일시적 실패가 그대로 "찾을 수 없어요"로 렌더되고 그게
// ISR 캐시에 최대 300초간 박제될 위험이 있었다).
async function findVideo(slug: string): Promise<CmsVideo | null> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const result = await fetchVideoBySlug(slug);
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
  const video = await findVideo(slug);
  if (!video) {
    return { title: '영상을 찾을 수 없어요', robots: { index: false } };
  }
  const title = buildPageTitle(video.title, '영상');
  const description = buildSeoDescription(video.excerpt, '서울경제 AI LENS가 정리한 이슈 영상입니다.');
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

function buildJsonLd(video: CmsVideo, slug: string, lens: CmsLens | null) {
  // VideoObject.transcript — 영상 대본이 있으면 구조화데이터에도 싣는다.
  const transcript = lens?.lenses.find((l) => l.label === '영상')?.transcript?.trim();
  const url = `${SITE_URL}/video/${slug}`;
  const published = video.published_at || `${video.date}T07:00:00+09:00`;
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
        description: buildSeoDescription(video.excerpt, video.title),
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
        ...(transcript ? { transcript } : {}),
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
  const video = await findVideo(slug);
  // 2026-09-03(ISR 재설계) — 원래 여긴 못 찾아도 200 + noindex로 렌더하고
  // 클라이언트(VideoViewClient)의 "찾을 수 없어요" 상태에 맡겼다. 3회
  // 재시도(findVideo)를 거치고도 없으면 진짜 없는 것으로 보고 실제 404를
  // 준다 — 크롤러 관점에서 soft-404(noindex)보다 정확한 신호.
  if (!video) {
    notFound();
  }
  // 같은 이슈의 lens 글(슬러그 동일)로 텍스트 보강(IssueContextSection 참조).
  const lens = await fetchLensBySlug(slug);
  const jsonLd = buildJsonLd(video, slug, lens);
  return (
    <>
      {jsonLd && (
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      )}
      <VideoViewClient
        slug={slug}
        initialVideo={video}
        supplement={<IssueContextSection lens={lens} format="영상" tone="light" />}
      />
    </>
  );
}
