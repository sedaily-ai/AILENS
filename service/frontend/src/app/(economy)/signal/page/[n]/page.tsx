import type { Metadata } from 'next';
import { buildEconomyCategoryMetadata, EconomyCategoryPage } from '@/widgets/CategoryArchiveClient';
import { CACHE_TTL_FALLBACK_SECONDS } from '@/shared/lib/api/cmsPostsApi';

// "시그널" 카테고리 아카이브 페이지네이션 — markets/page/[n]/page.tsx와
// 완전히 같은 패턴, slug만 고정해서 넘기는 wrapper.
type Params = Promise<{ n: string }>;

export const revalidate = 300; // = CACHE_TTL_FALLBACK_SECONDS(cmsPostsApi.ts) — route segment config는 정적 분석돼 import한 상수를 못 쓴다, 값 바뀌면 여기도 같이 바꿀 것
export const dynamicParams = true;

export async function generateStaticParams() {
  return [];
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { n } = await params;
  return buildEconomyCategoryMetadata('signal', parseInt(n, 10) || 1);
}

export default async function Page({ params }: { params: Params }) {
  const { n: rawN } = await params;
  const parsedN = parseInt(rawN, 10);
  const n = Number.isFinite(parsedN) && parsedN > 1 ? parsedN : 1;
  return EconomyCategoryPage({ slug: 'signal', page: n });
}
