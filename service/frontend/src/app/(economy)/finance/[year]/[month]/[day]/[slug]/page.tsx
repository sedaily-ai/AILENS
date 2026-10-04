import type { Metadata } from 'next';
import { buildLensArticleMetadata, LensArticlePageContent } from '@/app/(economy)/_shared/lensArticlePageShared';

// 카테고리별 lens 상세 — 로직은 lensArticlePageShared.tsx를 공유한다(7개 카테고리 폴더 중 하나).
// 이 파일은 카테고리 슬러그만 고정해 넘기는 wrapper이며 (economy)/markets/page.tsx(아카이브 목록)와 같은 패턴이다.
type Params = Promise<{ year: string; month: string; day: string; slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  return buildLensArticleMetadata('finance', params);
}

export const revalidate = 300;
export const dynamicParams = true;

// generateStaticParams가 없으면 Next가 이 라우트를 fully dynamic(ƒ) 처리해 revalidate를 명시해도 무시되고 캐시가 걸리지 않는다.
// 빈 배열을 반환하면 빌드 시점엔 아무것도 만들지 않고 요청 시 렌더해 ISR로 캐시하는 표준 패턴이 된다(dynamicParams:true와 짝).
export async function generateStaticParams() {
  return [];
}


export default async function Page({ params }: { params: Params }) {
  return LensArticlePageContent('finance', params);
}
