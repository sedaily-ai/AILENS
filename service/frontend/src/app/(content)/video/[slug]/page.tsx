import { seoHeadline } from '@/shared/lib/content/displayHeadline';
import { mediaSeoExtras } from '@/shared/lib/seo/mediaMeta';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { fetchVideos, fetchVideoBySlug, fetchLensBySlug, type CmsLens, type CmsVideo } from '@/shared/lib/api/cmsPostsApi';
import { resolveVideo } from '@/shared/lib/media/videoEmbed';
import { buildPageTitle } from '@/shared/lib/seo/buildPageTitle';
import { buildSeoDescription } from '@/shared/lib/seo/sanitizeDescription';
import { VideoViewClient } from './VideoViewClient';
import { IssueContextSection } from '../../_shared/IssueContextSection';

import { SITE_URL } from '@/shared/constants/site';

// webtoon/[slug]/page.tsx와 같은 이유의 가벼운 재시도 — fetchVideos() 단발 실패(콜드스타트 등)에 바로 "찾을 수 없어요"가 되지 않게 한다.
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

// 빌드 시점에는 최근 STATIC_PARAMS_LIMIT건만 정적 생성한다(lens/webtoon [slug]/page.tsx와 같은 이유 — 전체를 빌드하면 빌드 서버 디스크 부족 위험).
// 목록 API의 limit은 그대로 두며, 오래된 영상은 fetchVideoBySlug 단건 조회로 요청 시점에 렌더된다(generateMetadata·기본 export 모두 fetchVideoBySlug를 직접 사용).
// generateMetadata·JSON-LD·사이트맵은 이 함수와 무관하다. 0으로 비우지 않는 것은 <Link> 프리페치 유지와 라우트가 Dynamic으로 바뀌는 것을 막기 위해서다.
const STATIC_PARAMS_LIMIT = 10;

export async function generateStaticParams() {
  const videos = await fetchAllVideos();
  return videos.slice(0, STATIC_PARAMS_LIMIT).map((v) => ({ slug: v.id }));
}

export const dynamicParams = true;
// ⚠️ 리터럴이어야 함(lens/[slug]/page.tsx 주석 참조) — cmsPostsApi.ts의
// CACHE_TTL_FALLBACK_SECONDS와 값이 반드시 같아야 한다.
export const revalidate = 300;

// lens/webtoon의 findLens()/findWebtoon()과 동일한 3회 재시도 패턴. 재시도가 없으면 API 콜드스타트 같은 일시적 실패가 "찾을 수 없어요"로 렌더되어 ISR 캐시에 최대 300초간 남는다.
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
  const headline = seoHeadline(video.title);
  const title = buildPageTitle(headline, '영상');
  const description = buildSeoDescription(video.excerpt, '서울경제 AI LENS가 정리한 이슈 영상입니다.');
  // 영상 시청 페이지는 자기 자신이 정본 — 서버 HTML에 <video>와 VideoObject가 있어 동영상 색인의 대상이다.
  const url = `${SITE_URL}/video/${slug}`;
  const resolved = resolveVideo(video.video_url);
  const image = video.thumbnail_url || resolved?.autoThumbnailUrl || `${SITE_URL}/og-image.png`;
  const extras = mediaSeoExtras({ headline, description, url, publishedIso: video.published_at || `${video.date}T07:00:00+09:00`, kind: '영상' });
  return {
    title,
    description,
    keywords: extras.keywords,
    authors: extras.authors,
    category: extras.category,
    other: extras.other,
    alternates: { canonical: url, languages: extras.languages },
    openGraph: {
      title,
      description,
      url,
      type: 'video.other',
      images: [{ url: image, width: 1200, height: 630, alt: headline }],
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
        name: seoHeadline(video.title),
        description: buildSeoDescription(video.excerpt, seoHeadline(video.title)),
        keywords: [...new Set([seoHeadline(video.title), '영상', '경제 영상', '오늘의 이슈', 'AI LENS', '서울경제'])],
        genre: '뉴스 해설 영상',
        copyrightHolder: { '@id': `${SITE_URL}/#organization` },
        copyrightYear: Number(video.date.slice(0, 4)),
        creditText: '서울경제신문 AI LENS',
        ...(lens?.source_url ? { isBasedOn: { '@type': 'NewsArticle', url: lens.source_url, publisher: { '@id': `${SITE_URL}/#organization` } } } : {}),
        potentialAction: { '@type': 'WatchAction', target: [url] },
        thumbnailUrl: image,
        uploadDate: published,
        inLanguage: 'ko-KR',
        embedUrl: resolved?.embedUrl,
        // contentUrl 보강 — embedUrl은 유튜브/네이버TV만 resolveVideo()가 채우므로, 그 외 플랫폼이면 구글이 요구하는 재생 가능 URL 신호가 없다. video_url은 admin이 항상 입력하므로 채울 수 있다.
        // duration은 정확한 값을 얻을 소스가 없어(YouTube Data API 키 연동 필요) 추측값을 넣지 않는다.
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
      // BreadcrumbList — letters/lens와 같은 패턴.
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'AI LENS', item: SITE_URL },
          { '@type': 'ListItem', position: 2, name: '최신 뉴스', item: `${SITE_URL}/lens` },
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
  // 3회 재시도(findVideo) 후에도 없으면 진짜 없는 것으로 보고 실제 404를 준다. soft-404(200 + noindex)보다 크롤러에 정확한 신호이다.
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
