import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { fetchHomePlayerPosts } from '@/shared/lib/api/homePlayerApi';
import { ListenListClient } from '../../ListenListClient';
import {
  SITE_URL,
  LISTEN_LIST_TITLE,
  LISTEN_LIST_DESCRIPTION,
  LISTEN_PAGE_SIZE,
  buildListenJsonLd,
} from '../../listenListShared';

// /lens/page/[n]과 같은 패턴 — 경로 세그먼트라 generateStaticParams +
// force-cache 조합으로 캐시가 가능하다. 1페이지는 이 라우트에 없다
// (/listen 자체가 1페이지).
export async function generateStaticParams() {
  const items = await fetchHomePlayerPosts();
  const totalPages = Math.max(1, Math.ceil(items.length / LISTEN_PAGE_SIZE));
  return Array.from({ length: Math.max(0, totalPages - 1) }, (_, i) => ({ n: String(i + 2) }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ n: string }>;
}): Promise<Metadata> {
  const { n } = await params;
  const url = `${SITE_URL}/listen/page/${n}`;
  const title = `${LISTEN_LIST_TITLE} — ${n}페이지`;
  return {
    title,
    description: LISTEN_LIST_DESCRIPTION,
    alternates: { canonical: url },
    openGraph: {
      title,
      description: LISTEN_LIST_DESCRIPTION,
      url,
      type: 'website',
      images: [{ url: `${SITE_URL}/og-image.png`, width: 1200, height: 630, alt: 'AI LENS 오디오' }],
      locale: 'ko_KR',
      siteName: 'AI LENS — 서울경제',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: LISTEN_LIST_DESCRIPTION,
      images: [`${SITE_URL}/og-image.png`],
    },
  };
}

export default async function ListenListPageN({ params }: { params: Promise<{ n: string }> }) {
  const { n: rawN } = await params;
  const n = parseInt(rawN, 10);
  if (!Number.isFinite(n) || n <= 1) redirect('/listen');

  const items = await fetchHomePlayerPosts();
  const jsonLd = buildListenJsonLd(items);
  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <ListenListClient initialItems={items} initialPage={n} />
    </>
  );
}
