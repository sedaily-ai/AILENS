import type { Metadata } from 'next';
import { ArticlePageShell } from '@/widgets/ArticlePageShell';
import { LetterListView, fetchLetterList, buildLetterListMetadata, buildLetterListJsonLd } from '@/features/letter';

// 레터 목록. 발행된 레터를 서버(lens-cms-api)에서 읽는다. 2026-10-12 정식 오픈: 검색엔진 노출(사이트맵·구조화 데이터·llms 포함).
export const revalidate = 60;

export const metadata: Metadata = buildLetterListMetadata();

export default async function LetterListPage() {
  const letters = await fetchLetterList();
  return (
    <ArticlePageShell activeTab="letter">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(buildLetterListJsonLd(letters)) }} />
      <LetterListView letters={letters} />
    </ArticlePageShell>
  );
}
