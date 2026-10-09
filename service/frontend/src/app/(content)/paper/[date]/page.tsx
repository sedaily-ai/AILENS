import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { fetchLensPostsOnDate, fetchPaperDates, type CmsLens } from '@/shared/lib/api/cmsPostsApi';
import { fetchFollowingLetters } from '@/shared/lib/api/todayLettersApi';
import { buildPageTitle } from '@/shared/lib/seo/buildPageTitle';
import { toLensPreviewSummaries } from '@/shared/lib/api/cmsPostsApi';
import { pickLensPostsForHome } from '@/shared/lib/content/homeFeedTrim';
import { pickLensPhoto } from '@/shared/constants/lensPerspectives';
import { SITE_URL } from '@/shared/constants/site';
import { resolveShareImages } from '@/shared/lib/seo/shareImage';
import { PaperDayClient } from '../PaperDayClient';
import { buildPaperDescription, buildPaperJsonLd, paperDateLabel, paperKeywords, paperPath } from '../paperShared';

// "지난 지면" — 날짜별로 그날 편성된 지면 4개(최대 16건)를 보여 준다. 일반 기사는 제외한다.
// 서버가 렌더하므로 검색에 노출되고 공유할 수 있다. 지면 데이터(paper_section)는 2026-09-29부터라 그 이전 날짜는 404이다.
export const revalidate = 300; // = CACHE_TTL_FALLBACK_SECONDS(cmsPostsApi.ts). route segment config는 import한 상수를 쓸 수 없다.
export const dynamicParams = true;

// generateStaticParams가 없으면 Next가 이 라우트를 통째로 동적(ƒ)으로 처리해 매 요청이 서버 렌더·no-store가 된다(CDN 미캐시).
// 빈 배열을 돌려 "빌드 땐 만들지 않고 요청이 오면 렌더해 ISR로 캐시"하게 한다(카테고리 라우트와 같은 패턴).
export async function generateStaticParams() {
  return [];
}

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
  // 대표 이미지는 크기를 재서 폭 1200px 미만·배너형을 건너뛴다(기사 상세와 같은 규칙, shareImage.ts). 대표 기사 사진·컷 → 다른 기사 사진 순으로 최대 5개만 잰다.
  const candidates = [pickLensPhoto(hero), hero.cover_image_url, ...data.items.filter((l) => l !== hero).slice(0, 3).map((l) => pickLensPhoto(l))].filter((u): u is string => !!u);
  const share = await resolveShareImages(candidates);
  const photo = share.primary.url;
  const photoSize = share.primary.width ? { width: share.primary.width, height: share.primary.height } : {};
  return {
    title,
    description,
    keywords: paperKeywords(date),
    category: 'news',
    alternates: { canonical: url, languages: { 'ko-KR': url } },
    openGraph: { title, description, url, type: 'website', images: [{ url: photo, ...photoSize, alt: title }], locale: 'ko_KR', siteName: 'AI LENS — 서울경제' },
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
