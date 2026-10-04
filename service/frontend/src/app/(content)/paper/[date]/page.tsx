import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { fetchLensPostsOnDate, fetchPaperDates, type CmsLens } from '@/shared/lib/api/cmsPostsApi';
import { fetchFollowingLetters } from '@/shared/lib/api/todayLettersApi';
import { buildPageTitle } from '@/shared/lib/seo/buildPageTitle';
import { toLensPreviewSummaries } from '@/shared/lib/api/cmsPostsApi';
import { pickLensPostsForHome } from '@/shared/lib/homeFeedTrim';
import { pickLensPhoto } from '@/shared/constants/lensPerspectives';
import { SITE_URL } from '@/shared/constants/site';
import { PaperDayClient } from '../PaperDayClient';
import { buildPaperDescription, buildPaperJsonLd, paperDateLabel, paperKeywords, paperPath } from '../paperShared';

// "지난 지면"(2026-10-04) — 날짜별로 그날 편성된 지면 4개(최대 16건)를 보여 준다. 일반 기사는 제외(사용자 결정).
// 서버가 렌더하므로 검색에 노출되고 공유할 수 있다. 지면 데이터(paper_section)는 2026-09-29부터라 그 이전 날짜는 404.
export const revalidate = 300; // = CACHE_TTL_FALLBACK_SECONDS(cmsPostsApi.ts) — route segment config는 import한 상수를 못 쓴다
export const dynamicParams = true;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

async function load(date: string): Promise<{ dates: string[]; items: CmsLens[] } | null> {
  if (!DATE_RE.test(date)) return null;
  const dates = await fetchPaperDates();
  if (!dates.includes(date)) return null;
  const items = pickLensPostsForHome(await fetchLensPostsOnDate(date));
  return items.length > 0 ? { dates, items } : null;
}

export async function generateMetadata({ params }: { params: Promise<{ date: string }> }): Promise<Metadata> {
  const { date } = await params;
  const data = await load(date);
  if (!data) return { title: '지면을 찾을 수 없어요', robots: { index: false } };
  const title = buildPageTitle(`${paperDateLabel(date)} 지면`, '4가지 시선');
  const description = buildPaperDescription(date, data.items);
  const url = `${SITE_URL}${paperPath(date)}`;
  const hero = data.items.find((l) => l.paper_section === '전체') ?? data.items[0];
  const photo = pickLensPhoto(hero) || hero.cover_image_url || `${SITE_URL}/og-image.png`;
  return {
    title,
    description,
    keywords: paperKeywords(date),
    category: 'news',
    alternates: { canonical: url, languages: { 'ko-KR': url } },
    openGraph: { title, description, url, type: 'website', images: [{ url: photo, alt: title }], locale: 'ko_KR', siteName: 'AI LENS — 서울경제' },
    twitter: { card: 'summary_large_image', title, description, images: [photo] },
    other: {
      news_keywords: paperKeywords(date).join(', '),
      'DC.title': title,
      'DC.date': `${date}T07:00:00+09:00`,
      'DC.description': description,
      'DC.identifier': url,
      'DC.creator': 'AI LENS 편집팀',
    },
  };
}

export default async function PaperDayPage({ params }: { params: Promise<{ date: string }> }) {
  const { date } = await params;
  const [data, hotLetters] = await Promise.all([load(date), fetchFollowingLetters(10)]);
  if (!data) notFound();
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(buildPaperJsonLd(date, data.items)) }} />
      <PaperDayClient date={date} dates={data.dates} items={toLensPreviewSummaries(data.items)} initialHotLetters={hotLetters} />
    </>
  );
}
