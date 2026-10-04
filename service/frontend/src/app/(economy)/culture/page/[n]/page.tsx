import type { Metadata } from 'next';
import { buildEconomyCategoryMetadata, clampCategoryPage, EconomyCategoryPage } from '@/widgets/CategoryArchiveClient';

// 카테고리 아카이브 페이지네이션(/culture/page/[n]) — slug만 고정해 넘기는 wrapper. 라우트 설정 이유는
// widgets/CategoryArchiveClient/EconomyCategoryPage.tsx의 clampCategoryPage 주석 참조.
type Params = Promise<{ n: string }>;

export const revalidate = 300; // = CACHE_TTL_FALLBACK_SECONDS, 값 바뀌면 카테고리 라우트 전체를 같이 바꿀 것

export const dynamicParams = true;

export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { n } = await params;
  return buildEconomyCategoryMetadata('culture', parseInt(n, 10) || 1);
}

export default async function Page({ params }: { params: Params }) {
  const { n } = await params;
  return EconomyCategoryPage({ slug: 'culture', page: clampCategoryPage(n) });
}
