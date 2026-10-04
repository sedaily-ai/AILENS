import type { Metadata } from 'next';
import { SITE_URL } from '@/shared/constants/site';

export const metadata: Metadata = {
  title: '타임라인 — 경제 사건의 흐름',
  description:
    '이슈를 따라가는 가장 빠른 방법. 흩어진 경제 기사들을 시간 순으로 이어 사건의 흐름과 핵심만 짚어 드립니다. 날짜별로 그날의 경제 이슈를 한눈에 확인하세요.',
  alternates: { canonical: `${SITE_URL}/timeline` },
  openGraph: {
    title: '타임라인 — 경제 사건의 흐름',
    description: '이슈를 따라가는 가장 빠른 방법.',
    url: `${SITE_URL}/timeline`,
    type: 'website',
  },
};

export default function TimelineLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
