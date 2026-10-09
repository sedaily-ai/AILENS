import type { Metadata } from 'next';
import { ArticlePageShell } from '@/widgets/ArticlePageShell';
import { LetterListView, MOCK_LETTERS } from '@/features/letter';

// 모아쓰기 레터 목록(목업, 2026-10-09). 백엔드가 없어 화면 확정용 예시 데이터로 그린다 — 실제 발행 데이터가 붙기 전까지 검색엔진에 노출하지 않는다(noindex).
export const metadata: Metadata = {
  title: '레터 — 하나의 이슈, 여러 관점 | AI LENS',
  description: '소식, 실체, 다른 시각. 하나의 이슈를 여러 기사와 관점으로 엮은 AI LENS 레터.',
  robots: { index: false, follow: true },
};

export default function LetterListPage() {
  return (
    <ArticlePageShell activeTab="letter">
      <LetterListView letters={MOCK_LETTERS} />
    </ArticlePageShell>
  );
}
