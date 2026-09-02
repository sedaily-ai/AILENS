import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { fetchVideos } from '@/shared/lib/api/cmsPostsApi';
import { VideoListClient } from '../../VideoListClient';
import {
  SITE_URL,
  VIDEO_LIST_TITLE,
  VIDEO_LIST_DESCRIPTION,
  VIDEO_PAGE_SIZE,
  buildVideoJsonLd,
} from '../../videoListShared';

// /lens/page/[n]과 같은 패턴 — 경로 세그먼트라 generateStaticParams +
// force-cache 조합으로 캐시가 가능하다(쿼리스트링은 Next가 캐시를 못
// 건다). 1페이지는 이 라우트에 없다(/video 자체가 1페이지).
export async function generateStaticParams() {
  const items = await fetchVideos();
  const totalPages = Math.max(1, Math.ceil(items.length / VIDEO_PAGE_SIZE));
  return Array.from({ length: Math.max(0, totalPages - 1) }, (_, i) => ({ n: String(i + 2) }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ n: string }>;
}): Promise<Metadata> {
  const { n } = await params;
  const url = `${SITE_URL}/video/page/${n}`;
  const title = `${VIDEO_LIST_TITLE} — ${n}페이지`;
  return {
    title,
    description: VIDEO_LIST_DESCRIPTION,
    alternates: { canonical: url },
    openGraph: {
      title,
      description: VIDEO_LIST_DESCRIPTION,
      url,
      type: 'website',
      images: [{ url: `${SITE_URL}/og-image.png`, width: 1200, height: 630, alt: 'AI LENS 영상' }],
      locale: 'ko_KR',
      siteName: 'AI LENS — 서울경제',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: VIDEO_LIST_DESCRIPTION,
      images: [`${SITE_URL}/og-image.png`],
    },
  };
}

export default async function VideoListPageN({ params }: { params: Promise<{ n: string }> }) {
  const { n: rawN } = await params;
  const n = parseInt(rawN, 10);
  if (!Number.isFinite(n) || n <= 1) redirect('/video');

  const items = await fetchVideos();
  const jsonLd = buildVideoJsonLd(items);
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <VideoListClient initialItems={items} initialPage={n} />
    </>
  );
}
