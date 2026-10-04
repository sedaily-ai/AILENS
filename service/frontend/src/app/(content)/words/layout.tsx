import type { Metadata } from 'next';

// words/page.tsx가 'use client'라 metadata export가 안 돼서 이 layout.tsx로
// 대신 채운다 — timemachine/layout.tsx와 같은 패턴
// (SEO 감사 2026-08-11, 페이지가 아예 메타데이터 없이 루트 layout.tsx
// 기본값만 상속하던 걸 발견).
import { SITE_URL } from '@/shared/constants/site';
const TITLE = '용어 해설 — 경제 용어 사전';
const DESCRIPTION = 'AI LENS 기사에 나온 경제·시사 용어를 쉬운 말로 풀어 모았습니다. 금리·환율·공매도 같은 낯선 경제 용어가 궁금할 때 하나씩 찾아보고, 퀴즈로 복습할 수도 있습니다.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/words` },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `${SITE_URL}/words`,
    type: 'website',
    images: [{ url: `${SITE_URL}/og-image.png`, width: 1200, height: 630, alt: 'AI LENS 용어 해설' }],
    locale: 'ko_KR',
    siteName: 'AI LENS — 서울경제',
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: [`${SITE_URL}/og-image.png`],
  },
};

export default function WordsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
