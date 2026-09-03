import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { fetchWebtoons } from '@/shared/lib/api/cmsPostsApi';
import { WebtoonListClient } from '../../WebtoonListClient';
import {
  SITE_URL,
  WEBTOON_LIST_TITLE,
  WEBTOON_LIST_DESCRIPTION,
  buildWebtoonJsonLd,
} from '../../webtoonListShared';

// 2026-09-03 — generateStaticParams 제거(SSR 전환, 빌드 시간 감사).
// /lens/page/[n]과 같은 이유 — 아카이브 뒷장은 실사용자가 거의 안
// 들어가는데도 빌드 때마다 전부 미리 구워서 낭비였다.
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
