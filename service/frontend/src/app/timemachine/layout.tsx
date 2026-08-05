import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '타임머신 — 그날의 경제 뉴스',
  description:
    '내 생일, 결혼기념일, 그 어떤 날이라도 — 그날의 경제 뉴스를 다시 봅니다. 과거 사건과 오늘을 잇는 AI LENS의 시간 여행.',
  alternates: { canonical: 'https://ailens.sedaily.ai/timemachine' },
  openGraph: {
    title: '타임머신 — 그날의 경제 뉴스',
    description: '내 생일·기념일의 경제 뉴스를 다시 보는 시간 여행.',
    url: 'https://ailens.sedaily.ai/timemachine',
    type: 'website',
  },
};

export default function TimemachineLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
