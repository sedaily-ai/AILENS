import type { Metadata } from 'next';
import { buildLensArticleMetadata, LensArticlePageContent } from '@/app/(economy)/_shared/lensArticlePageShared';

// 카테고리별 lens 상세 — 실제 로직은 전부 lensArticlePageShared.tsx 공유
// (7개 카테고리 폴더 중 하나, 2026-09-30). 이 파일은 카테고리 슬러그만
// 고정해서 넘기는 wrapper — (economy)/markets/page.tsx(아카이브 목록)와
// 같은 패턴.
type Params = Promise<{ year: string; month: string; day: string; slug: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  return buildLensArticleMetadata('news', params);
}

export const revalidate = 300;
export const dynamicParams = true;

// generateStaticParams가 아예 없으면 Next가 이 라우트를 통째로 fully
// dynamic(ƒ) 처리해 캐시가 전혀 안 걸린다 — revalidate를 명시해도 무시됨
// (실측: 클린 빌드 결과 항상 ƒ, 배포 후 항상 no-store, 2026-09-30). 빈
// 배열을 반환해 "빌드 시점엔 아무 것도 미리 안 만들지만 요청이 오면 그때
// 렌더해서 ISR로 캐시해도 된다"는 걸 Next에 알려주는 표준 패턴
// (dynamicParams:true와 짝 — 빌드 시간·산출물 크기를 늘리지 않으면서도
// 캐싱은 정상 작동하게 한다).
export async function generateStaticParams() {
  return [];
}


export default async function Page({ params }: { params: Params }) {
  return LensArticlePageContent('news', params);
}
