import type { Metadata } from 'next';
import { buildEconomyCategoryMetadata, EconomyCategoryPage } from '@/widgets/CategoryArchiveClient';

// 카테고리 아카이브 7개 중 하나 — 공통 로직은 shared/lib/economyCategoryPage.tsx
// 하나에 모아뒀다(2026-08-20 리팩토링). 이 파일은 slug만 넘기는 wrapper.
export const metadata: Metadata = buildEconomyCategoryMetadata('markets');

// export const revalidate 명시(2026-09-30) — 같은 코드를 쓰는 카테고리 7개 중 일부가 빌드마다 s-maxage=31536000(사실상 영구)으로 굳는 현상이 실측 확인돼(Next의 Full Route Cache가 빌드 시점 fetch 성공/여부로 판정을 다르게 내리는 것으로 추정), 명시적으로 선언해 항상 300초로 고정한다.
export const revalidate = 300; // = CACHE_TTL_FALLBACK_SECONDS(cmsPostsApi.ts) — route segment config는 정적 분석돼 import한 상수를 못 쓴다, 값 바뀌면 여기도 같이 바꿀 것

export default function MarketsPage() {
  return <EconomyCategoryPage slug="markets" />;
}
