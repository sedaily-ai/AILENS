import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { fetchLensPosts } from '@/shared/lib/api/cmsPostsApi';
import { fetchFollowingLetters } from '@/shared/lib/api/todayLettersApi';
import { LensListClient } from '../../LensListClient';
import {
  SITE_URL,
  LENS_LIST_TITLE,
  LENS_LIST_DESCRIPTION,
  buildLensJsonLd,
} from '../../lensListShared';

// 2026-09-03 — generateStaticParams 제거(SSR 전환, 빌드 시간 감사).
// 아카이브 뒷장(예: /lens/page/15)은 실사용자가 거의 안 들어가는데도
// 빌드 때마다 전부 미리 구워서 빌드 시간·릴리스 용량을 불필요하게
// 늘리고 있었다 — [slug] 상세 페이지(<Link> 프리페치가 중요한 곳)와
// 달리 페이지네이션은 그 UX 이득이 미미해 완전 동적 렌더로 바꾼다.
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
