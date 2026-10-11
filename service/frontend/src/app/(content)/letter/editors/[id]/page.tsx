import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ArticlePageShell } from '@/widgets/ArticlePageShell';
import { LetterListView, fetchLetterList, findEditor } from '@/features/letter';

// 에디터 주소(/letter/editors/{id})는 레터 목록에서 그 에디터를 고른 화면으로 연다. 정식 오픈 전까지 noindex.
export const revalidate = 60;

type Params = { id: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const editor = findEditor((await params).id);
  return { title: editor ? `${editor.name} · ${editor.role} | AI LENS 레터` : '레터 에디터', robots: { index: false, follow: true } };
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
