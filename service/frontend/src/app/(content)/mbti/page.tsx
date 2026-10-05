import type { Metadata } from 'next';
import { StaticPageShell } from '@/widgets/StaticPageShell';
import { MbtiLanding } from '@/features/mbti';
import { SITE_URL } from '@/shared/constants/site';

// MBTI 코너 첫 화면(2026-10-05) — 설계: docs/worklog/2026-10/2026-10-05-mbti-corner-design.md
const TITLE = 'MBTI로 보는 오늘의 뉴스';
const DESCRIPTION = '내 MBTI 인지유형(NT·NF·ST·SF)에 맞는 형식으로 오늘의 서울경제 이슈를 골라 드려요.';
const URL = `${SITE_URL}/mbti`;

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: URL },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: URL,
    type: 'website',
    images: [{ url: `${SITE_URL}/og-image.png`, width: 1200, height: 630, alt: TITLE }],
    locale: 'ko_KR',
    siteName: 'AI LENS — 서울경제',
  },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION, images: [`${SITE_URL}/og-image.png`] },
};

export default function MbtiPage() {
  return (
    <StaticPageShell title={TITLE}>
      <MbtiLanding />
    </StaticPageShell>
  );
}
