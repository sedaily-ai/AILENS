import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { ArticlePageShell } from '@/widgets/ArticlePageShell';
import { LetterDetailView, fetchLetterDetail, fetchLetterList } from '@/features/letter';

// 레터 상세. 발행된 레터만 열린다(없거나 초안이면 404). 정식 오픈 전까지 noindex.
export const revalidate = 60;
export const dynamicParams = true;

// generateStaticParams가 없으면 Next가 이 라우트를 통째로 동적(ƒ)으로 처리해 매 요청이 서버 렌더·no-store가 된다(CDN 미캐시, 2026-10-12 실측: cache-control private no-store).
// 빈 배열을 돌려 "빌드 땐 만들지 않고 요청이 오면 렌더해 ISR로 캐시"하게 한다(카테고리·지난 지면 라우트와 같은 패턴).
export async function generateStaticParams() {
  return [];
}

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
      <LetterDetailView letter={letter} prevSlug={i >= 0 ? list[i + 1]?.slug : undefined} nextSlug={i > 0 ? list[i - 1]?.slug : undefined} others={list} />
    </ArticlePageShell>
  );
}
