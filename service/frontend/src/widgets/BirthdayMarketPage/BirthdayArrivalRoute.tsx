import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { SITE_URL } from '@/shared/constants/site';
import { ARRIVAL_DESCRIPTION, BIRTHDAY_MARKET_PATH, arrivalTitle, parseArrivalDate } from '@/features/news-feed';
import { BirthdayMarketPage } from './BirthdayMarketPage';

// 도착 페이지 — 그날 신문 카드의 QR이 여는 /birthday-market/YYYY-MM-DD. 날짜마다 거의 같은 화면이라 검색에 내지 않는다(noindex, 사이트맵에도 없음).
// 없는 날짜·1900년 전·오늘 이후는 404다. 그날 기사는 브라우저가 불러오므로 이 라우트는 날짜만 확인한다.
type Params = { params: Promise<{ date: string }> };

export async function generateArrivalMetadata({ params }: Params): Promise<Metadata> {
  const { date } = await params;
  const valid = parseArrivalDate(date);
  if (!valid) return { title: '날짜를 찾을 수 없어요', robots: { index: false } };
  const title = arrivalTitle(valid);
  const url = `${SITE_URL}${BIRTHDAY_MARKET_PATH}/${valid}`;
  return {
    title,
    description: ARRIVAL_DESCRIPTION,
    robots: { index: false, follow: true },
    openGraph: { title, description: ARRIVAL_DESCRIPTION, url, type: 'website', images: [{ url: `${SITE_URL}/og-image.png`, width: 1200, height: 630, alt: title }] },
    twitter: { card: 'summary_large_image', title, description: ARRIVAL_DESCRIPTION, images: [`${SITE_URL}/og-image.png`] },
  };
}

export async function BirthdayArrivalRoute({ params }: Params) {
  const { date } = await params;
  const valid = parseArrivalDate(date);
  if (!valid) notFound();
  return <BirthdayMarketPage arrivalDate={valid} />;
}
