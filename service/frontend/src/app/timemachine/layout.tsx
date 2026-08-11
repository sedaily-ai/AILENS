import type { Metadata } from 'next';

const SITE_URL = 'https://ailens.sedaily.ai';
const TITLE = '타임머신 — 그날의 경제 뉴스';
const DESCRIPTION =
  '내 생일, 결혼기념일, 그 어떤 날이라도 — 그날의 경제 뉴스를 다시 봅니다. 과거 사건과 오늘을 잇는 AI LENS의 시간 여행.';

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: `${SITE_URL}/timemachine` },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: `${SITE_URL}/timemachine`,
    type: 'website',
    images: [{ url: `${SITE_URL}/og-image.png`, width: 1200, height: 630, alt: 'AI LENS 타임머신' }],
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

export default function TimemachineLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
