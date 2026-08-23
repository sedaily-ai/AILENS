import type { Metadata } from 'next';

// words/page.tsx가 'use client'라 metadata export가 안 돼서 이 layout.tsx로
// 대신 채운다 — timemachine/layout.tsx와 같은 패턴
// (SEO 감사 2026-08-11, 페이지가 아예 메타데이터 없이 루트 layout.tsx
// 기본값만 상속하던 걸 발견).
import { SITE_URL } from '@/shared/constants/site';
const TITLE = '용어 해설 — 경제 용어 사전';
const DESCRIPTION = 'AI LENS 레터에 나온 경제·시사 용어를 모아뒀어요. 궁금할 때마다 하나씩 찾아보세요.';

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
