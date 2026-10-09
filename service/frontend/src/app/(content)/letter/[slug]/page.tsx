import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ArticlePageShell } from '@/widgets/ArticlePageShell';
import { LetterDetailView, MOCK_LETTERS, findMockLetter } from '@/features/letter';

// 모아쓰기 레터 상세(목업). 목업 슬러그만 열린다(dynamicParams=false). 발행 데이터 연결 전까지 noindex.
export const dynamicParams = false;

export function generateStaticParams() {
  return MOCK_LETTERS.map((l) => ({ slug: l.slug }));
}

type Params = { slug: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { slug } = await params;
  const letter = findMockLetter(decodeURIComponent(slug));
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
  const letter = findMockLetter(slug);
  if (!letter) notFound();
  const i = MOCK_LETTERS.findIndex((l) => l.slug === slug);
  return (
    <ArticlePageShell activeTab="letter">
      <LetterDetailView letter={letter} prevSlug={MOCK_LETTERS[i + 1]?.slug} nextSlug={MOCK_LETTERS[i - 1]?.slug} />
    </ArticlePageShell>
  );
}
