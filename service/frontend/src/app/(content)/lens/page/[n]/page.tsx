import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { fetchLensPosts } from '@/shared/lib/api/cmsPostsApi';
import { fetchFollowingLetters } from '@/shared/lib/api/todayLettersApi';
import { LensListClient } from '../../LensListClient';
import {
  SITE_URL,
  LENS_LIST_TITLE,
  LENS_LIST_DESCRIPTION,
  LENS_PAGE_SIZE,
  buildLensJsonLd,
} from '../../lensListShared';

// 쿼리스트링(/lens?page=N) 페이지네이션을 경로로 옮김(2026-08-23) —
// ../../page.tsx 상단 주석 참조. 경로 세그먼트는 [slug] 페이지들처럼
// generateStaticParams + force-cache 조합으로 캐시가 가능하지만, 쿼리
// 스트링은 Next가 원천적으로 캐시를 못 건다. 1페이지는 이 라우트에 없다
// (/lens 자체가 1페이지) — n=1 이하나 숫자가 아니면 정규 URL로 보낸다.
export async function generateStaticParams() {
  const items = await fetchLensPosts();
  const totalPages = Math.max(1, Math.ceil((items.length - 1) / LENS_PAGE_SIZE));
  return Array.from({ length: Math.max(0, totalPages - 1) }, (_, i) => ({ n: String(i + 2) }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ n: string }>;
}): Promise<Metadata> {
  const { n } = await params;
  const url = `${SITE_URL}/lens/page/${n}`;
  const title = `${LENS_LIST_TITLE} — ${n}페이지`;
  return {
    title,
    description: LENS_LIST_DESCRIPTION,
    alternates: { canonical: url },
    openGraph: {
      title,
      description: LENS_LIST_DESCRIPTION,
      url,
      type: 'website',
      images: [{ url: `${SITE_URL}/og-image.png`, width: 1200, height: 630, alt: 'AI LENS — 4가지 시선' }],
      locale: 'ko_KR',
      siteName: 'AI LENS — 서울경제',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: LENS_LIST_DESCRIPTION,
      images: [`${SITE_URL}/og-image.png`],
    },
  };
}

export default async function LensListPageN({ params }: { params: Promise<{ n: string }> }) {
  const { n: rawN } = await params;
  const n = parseInt(rawN, 10);
  if (!Number.isFinite(n) || n <= 1) redirect('/lens');

  const [items, hotLetters] = await Promise.all([fetchLensPosts(), fetchFollowingLetters(5)]);
  const jsonLd = buildLensJsonLd(items);
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <LensListClient initialItems={items} initialPage={n} initialHotLetters={hotLetters} />
    </>
  );
}
