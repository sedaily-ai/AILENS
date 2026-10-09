import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ArticlePageShell } from '@/widgets/ArticlePageShell';
import { LetterDetailView, fetchLetterDetail, fetchLetterList } from '@/features/letter';

// 레터 상세. 발행된 레터만 열린다(없거나 초안이면 404). 정식 오픈 전까지 noindex.
export const revalidate = 60;

type Params = { slug: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const letter = await fetchLetterDetail(decodeURIComponent(slug));
  if (!letter) return { title: '레터', robots: { index: false } };
  return {
    title: `${letter.title} | AI LENS 레터`,
    description: letter.deck,
    robots: { index: false, follow: true },
  };
}

export default async function LetterDetailPage({ params }: { params: Promise<Params> }) {
  const { slug: raw } = await params;
  const slug = decodeURIComponent(raw);
  const [letter, list] = await Promise.all([fetchLetterDetail(slug), fetchLetterList()]);
  if (!letter) notFound();
  const i = list.findIndex((l) => l.slug === slug);
  return (
    <ArticlePageShell activeTab="letter">
      <LetterDetailView letter={letter} prevSlug={i >= 0 ? list[i + 1]?.slug : undefined} nextSlug={i > 0 ? list[i - 1]?.slug : undefined} />
    </ArticlePageShell>
  );
}
