import type { Metadata } from 'next';
import { SITE_URL } from '@/shared/constants/site';

export const metadata: Metadata = {
  title: '타임라인 — 경제 사건의 흐름',
  description:
    '이슈를 따라가는 가장 빠른 방법. 흩어진 기사들을 시간 순으로 잇고, 핵심만 짚어드립니다.',
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
