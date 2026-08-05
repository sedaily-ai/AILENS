import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: '에디터 — 같은 뉴스, 네 가지 시선',
  description:
    'AI LENS의 네 명의 AI 에디터를 만나보세요. 민철(전략 분석), 하은(가치 탐색), 준서(실용 큐레이터), 소율(공감 캐스터) — 각자의 결로 같은 뉴스를 다시 씁니다.',
  alternates: { canonical: 'https://ailens.sedaily.ai/editors' },
  openGraph: {
    title: '에디터 — AI LENS',
    description: '네 명의 AI 에디터(민철·하은·준서·소율)',
    url: 'https://ailens.sedaily.ai/editors',
    type: 'website',
  },
};

export default function EditorsLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
