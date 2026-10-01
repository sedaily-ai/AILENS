import type { Metadata } from 'next';
import { buildEconomyCategoryMetadata, EconomyCategoryPage } from '@/widgets/CategoryArchiveClient';
import { CACHE_TTL_FALLBACK_SECONDS } from '@/shared/lib/api/cmsPostsApi';

// 카테고리 아카이브 페이지네이션(2026-09-30, 서울경제 본지 사이트
// sedaily.com/politics/president 참고 요청) — video/listen/lens와 같은
// /{slug}/page/[n] 경로 세그먼트 패턴. 이 파일은 카테고리 슬러그만
// 고정해서 넘기는 wrapper(EconomyCategoryPage.tsx 참조).
type Params = Promise<{ n: string }>;

// export const revalidate 명시(2026-09-30) — 없으면 generateMetadata가 동적 함수라는 이유만으로 Next가 이 라우트를 fully dynamic 처리해 캐시가 전혀 안 걸렸다(실측: 항상 no-store). 부모 카테고리(../page.tsx)와 동일하게 명시적으로 300초 고정.
export const revalidate = 300; // = CACHE_TTL_FALLBACK_SECONDS(cmsPostsApi.ts) — route segment config는 정적 분석돼 import한 상수를 못 쓴다, 값 바뀌면 여기도 같이 바꿀 것

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

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { n } = await params;
  return buildEconomyCategoryMetadata('culture', parseInt(n, 10) || 1);
}

export default async function Page({ params }: { params: Params }) {
  const { n: rawN } = await params;
  // n<=1 리다이렉트는 middleware.ts가 처리(redirect()를 여기 두면 캐시
  // 불가 판정됨 — 상단 revalidate 주석 참조), 여기선 안전하게 clamp만.
  const parsedN = parseInt(rawN, 10);
  const n = Number.isFinite(parsedN) && parsedN > 1 ? parsedN : 1;
  return EconomyCategoryPage({ slug: 'culture', page: n });
}
