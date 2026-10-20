import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ArticlePageShell } from '@/widgets/ArticlePageShell';
import { LetterListView, fetchLetterList, findEditor, buildLetterEditorMetadata } from '@/features/letter';

// 에디터 주소(/letter/editors/{id})는 레터 목록에서 그 에디터를 고른 화면으로 연다. 목록과 내용이 겹쳐 색인에서 뺀다(noindex, follow, canonical=/letter).
export const revalidate = 60;
export const dynamicParams = true;

// generateStaticParams가 없으면 Next가 이 라우트를 통째로 동적(ƒ)으로 처리해 매 요청이 서버 렌더·no-store가 된다(CDN 미캐시, 2026-10-12 실측: cache-control private no-store).
// 빈 배열을 돌려 "빌드 땐 만들지 않고 요청이 오면 렌더해 ISR로 캐시"하게 한다(카테고리·지난 지면 라우트와 같은 패턴).
export async function generateStaticParams() {
  return [];
}

type Params = { id: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const editor = findEditor((await params).id);
  return editor ? buildLetterEditorMetadata(editor.name, editor.pitch) : { title: '레터 에디터', robots: { index: false, follow: true } };
}

export default async function LetterEditorPage({ params }: { params: Promise<Params> }) {
  const id = (await params).id;
  if (!findEditor(id)) notFound();
  const letters = await fetchLetterList();
  return (
    <ArticlePageShell activeTab="letter">
      <LetterListView letters={letters} initialEditorId={id} />
    </ArticlePageShell>
  );
}
