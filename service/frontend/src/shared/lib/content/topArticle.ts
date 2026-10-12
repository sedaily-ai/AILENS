import type { CmsLens } from '@/shared/lib/api/cmsPostsApi';

/**
 * 오늘의 1면 — paper_section이 "전체"인 것 중 display_order 우선, 없으면 API 정렬(발행일 내림차순)의 첫 건.
 * /start(features/onboarding/OnboardingFlow.tsx, 클라이언트)와 /onboarding(page.tsx, 서버)이 함께 쓴다.
 * 'use client' 파일 안에 두면 서버 컴포넌트에서 호출할 수 없어 이 파일로 옮겼다(동작은 그대로).
 */
export function pickTopArticle(posts: CmsLens[]): CmsLens | null {
  const candidates = posts.filter((p) => p.paper_section === '전체');
  if (candidates.length === 0) return null;
  const sorted = [...candidates].sort((a, b) => {
    const oa = a.display_order;
    const ob = b.display_order;
    if (oa != null && ob != null) return oa - ob;
    if (oa != null) return -1;
    if (ob != null) return 1;
    return 0;
  });
  return sorted[0];
}
