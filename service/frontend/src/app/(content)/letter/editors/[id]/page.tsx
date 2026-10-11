import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ArticlePageShell } from '@/widgets/ArticlePageShell';
import { EditorProfileView, fetchLetterList, findEditor, editorsOfLetter } from '@/features/letter';

// 레터 에디터 프로필(목업). 정식 오픈 전까지 noindex.
export const revalidate = 60;

type Params = { id: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const editor = findEditor((await params).id);
  return { title: editor ? `${editor.name} · ${editor.role} | AI LENS 레터` : '레터 에디터', robots: { index: false, follow: true } };
}

export default async function LetterEditorPage({ params }: { params: Promise<Params> }) {
  const editor = findEditor((await params).id);
  if (!editor) notFound();
  const letters = (await fetchLetterList()).filter((l) => editorsOfLetter(l).some((e) => e.id === editor.id));
  return (
    <ArticlePageShell activeTab="letter">
      <EditorProfileView editor={editor} letters={letters} />
    </ArticlePageShell>
  );
}
