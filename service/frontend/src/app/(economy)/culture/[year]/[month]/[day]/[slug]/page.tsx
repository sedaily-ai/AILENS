import type { Metadata } from 'next';
import { buildLensArticleMetadata, LensArticlePageContent } from '@/app/(economy)/_shared/lensArticlePageShared';

// 카테고리별 lens 상세 — 실제 로직은 전부 lensArticlePageShared.tsx 공유
// (7개 카테고리 폴더 중 하나, 2026-09-30). 이 파일은 카테고리 슬러그만
// 고정해서 넘기는 wrapper — (economy)/markets/page.tsx(아카이브 목록)와
// 같은 패턴.
type Params = Promise<{ year: string; month: string; day: string; slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  return buildLensArticleMetadata('culture', params);
}

export const revalidate = 300;
export const dynamicParams = true;

export default async function Page({ params }: { params: Params }) {
  return LensArticlePageContent('culture', params);
}
