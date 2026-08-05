import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { editors, getEditor } from './editorsData';
import { EditorDetailClient } from './EditorDetailClient';

interface Params {
  params: Promise<{ id: string }>;
}

export async function generateStaticParams() {
  return editors.map((e) => ({ id: e.id }));
}

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { id } = await params;
  const e = getEditor(id);
  if (!e) return { title: '에디터' };
  return {
    title: `${e.name} 에디터 — ${e.role}`,
    description: `${e.bio} · ${e.signature.join(', ')} 큐레이션`,
    openGraph: {
      title: `${e.name} · ${e.role} | AI LENS`,
      description: e.bio,
      type: 'profile',
      locale: 'ko_KR',
    },
    alternates: { canonical: `/editors/${e.id}` },
  };
}

export default async function EditorDetailPage({ params }: Params) {
  const { id } = await params;
  const editor = getEditor(id);
  if (!editor) notFound();
  return <EditorDetailClient editor={editor} />;
}
