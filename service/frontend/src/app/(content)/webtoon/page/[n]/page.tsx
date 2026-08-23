import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { fetchWebtoons } from '@/shared/lib/api/cmsPostsApi';
import { WebtoonListClient } from '../../WebtoonListClient';
import {
  SITE_URL,
  WEBTOON_LIST_TITLE,
  WEBTOON_LIST_DESCRIPTION,
  WEBTOON_PAGE_SIZE,
  buildWebtoonJsonLd,
} from '../../webtoonListShared';

// 쿼리스트링(/webtoon?page=N) 페이지네이션을 경로로 옮김(2026-08-23) —
// ../../page.tsx, lens/page/[n]/page.tsx와 같은 이유·같은 구조.
export async function generateStaticParams() {
  const items = await fetchWebtoons();
  const totalPages = Math.max(1, Math.ceil((items.length - 1) / WEBTOON_PAGE_SIZE));
  return Array.from({ length: Math.max(0, totalPages - 1) }, (_, i) => ({ n: String(i + 2) }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ n: string }>;
}): Promise<Metadata> {
  const { n } = await params;
  const url = `${SITE_URL}/webtoon/page/${n}`;
  const title = `${WEBTOON_LIST_TITLE} — ${n}페이지`;
  return {
    title,
    description: WEBTOON_LIST_DESCRIPTION,
    alternates: { canonical: url },
    openGraph: {
      title,
      description: WEBTOON_LIST_DESCRIPTION,
      url,
      type: 'website',
      images: [{ url: `${SITE_URL}/og-image.png`, width: 1200, height: 630, alt: 'AI LENS 웹툰' }],
      locale: 'ko_KR',
      siteName: 'AI LENS — 서울경제',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: WEBTOON_LIST_DESCRIPTION,
      images: [`${SITE_URL}/og-image.png`],
    },
  };
}

export default async function WebtoonListPageN({ params }: { params: Promise<{ n: string }> }) {
  const { n: rawN } = await params;
  const n = parseInt(rawN, 10);
  if (!Number.isFinite(n) || n <= 1) redirect('/webtoon');

  const items = await fetchWebtoons();
  const jsonLd = buildWebtoonJsonLd(items);
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <WebtoonListClient initialItems={items} initialPage={n} />
    </>
  );
}
