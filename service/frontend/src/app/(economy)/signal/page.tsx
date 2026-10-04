import type { Metadata } from 'next';
import { buildEconomyCategoryMetadata, EconomyCategoryPage } from '@/widgets/CategoryArchiveClient';

// "시그널"(Market Signal) 카테고리 아카이브(2026-10-01) — markets/page.tsx와
// 완전히 같은 패턴, slug만 다른 wrapper. econCategories.ts 주석 참조.
export const metadata: Metadata = buildEconomyCategoryMetadata('signal');

export const revalidate = 300; // = CACHE_TTL_FALLBACK_SECONDS(cmsPostsApi.ts) — route segment config는 정적 분석돼 import한 상수를 못 쓴다, 값 바뀌면 여기도 같이 바꿀 것

export default function SignalPage() {
  return <EconomyCategoryPage slug="signal" />;
}
