import { permanentRedirect, notFound } from 'next/navigation';
import { fetchLensBySlug } from '@/shared/lib/api/cmsPostsApi';
import { lensPath } from '@/shared/lib/content/lensUrl';

// 2026-09-30 — 오늘 두 번째 URL 개편: /{slug}(오늘 1차 변경분, 카테고리
// 없는 평면 구조)를 /{category}/{yyyy}/{mm}/{dd}/{slug}로 다시 감쌌다
// (en.sedaily.com 패턴 참고 요청). 이 라우트는 이제 렌더링을 안 하고
// 정본 경로로 리다이렉트만 한다 — 배포 후 몇 분 안 된 링크라 실제
// 색인·공유 리스크는 낮지만, /lens/:slug → /:slug(구 1차 리다이렉트,
// next.config.ts)를 거쳐 들어오는 요청까지 한 번에 정리한다.
export const revalidate = 300;

export default async function LegacyFlatLensRedirect({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug);
  const lens = await fetchLensBySlug(slug);
  if (!lens) notFound();
  // 영구 이동(308) — 예전엔 redirect()라 307(임시)이어서 구글이 옛 주소를 색인에 남길 수 있었다(2026-10-01 Search Console 점검).
  permanentRedirect(lensPath(lens));
}
