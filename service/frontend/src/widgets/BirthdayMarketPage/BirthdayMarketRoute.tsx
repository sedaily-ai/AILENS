import type { Metadata } from 'next';
import { SITE_URL } from '@/shared/constants/site';
import { BIRTHDAY_MARKET_PATH } from '@/features/news-feed';
import { BirthdayMarketPage } from './BirthdayMarketPage';

const title = '생일 시세 타임머신 — 그날로 떠나요';
const description = '내가 태어난 날의 물가와 최저임금부터 현금 구매력과 연금까지, 18개 항목으로 경제의 변화를 살펴보세요.';
const url = `${SITE_URL}${BIRTHDAY_MARKET_PATH}`;

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: url },
  openGraph: { title, description, url, type: 'website', images: [{ url: `${SITE_URL}/og-image.png`, width: 1200, height: 630, alt: title }] },
  twitter: { card: 'summary_large_image', title, description, images: [`${SITE_URL}/og-image.png`] },
};

export default function BirthdayMarketRoute() { return <BirthdayMarketPage />; }
