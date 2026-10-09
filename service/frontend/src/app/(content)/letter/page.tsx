import type { Metadata } from 'next';
import { ArticlePageShell } from '@/widgets/ArticlePageShell';
import { LetterListView, fetchLetterList } from '@/features/letter';

// 레터 목록. 발행된 레터를 서버(lens-cms-api)에서 읽는다. 정식 오픈(푸터·사이트맵·구조화 데이터 정비) 전까지 검색엔진에는 노출하지 않는다(noindex).
export const revalidate = 60;

export const metadata: Metadata = {
  title: '레터 — 하나의 이슈, 여러 관점 | AI LENS',
  description: '소식, 실체, 다른 시각. 하나의 이슈를 여러 기사와 관점으로 엮은 AI LENS 레터.',
  robots: { index: false, follow: true },
};

export default async function LetterListPage() {
  const letters = await fetchLetterList();
  return (
    <ArticlePageShell activeTab="letter">
      <LetterListView letters={letters} />
    </ArticlePageShell>
  );
}
