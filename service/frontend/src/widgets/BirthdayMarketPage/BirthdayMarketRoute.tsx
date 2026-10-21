import type { Metadata } from 'next';
import { SITE_URL } from '@/shared/constants/site';
import { BIRTHDAY_MARKET_PATH } from '@/features/news-feed';
import { BirthdayMarketPage } from './BirthdayMarketPage';

const title = '내가 태어난 날, 그때와 지금 — 내 생일 타임머신';
const description = '내 생일의 서울경제부터 최저시급, 큰 사건과 그때 내 나이, 국민연금 달력까지. 생일을 넣고 그날로 돌아가 보세요.';
const url = `${SITE_URL}${BIRTHDAY_MARKET_PATH}`;

export const metadata: Metadata = {
  title,
  description,
  alternates: { canonical: url },
  openGraph: { title, description, url, type: 'website', images: [{ url: `${SITE_URL}/og-image.png`, width: 1200, height: 630, alt: title }] },
  twitter: { card: 'summary_large_image', title, description, images: [`${SITE_URL}/og-image.png`] },
};

export default function BirthdayMarketRoute() { return <BirthdayMarketPage />; }
