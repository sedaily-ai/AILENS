import { permanentRedirect, notFound } from 'next/navigation';
import { fetchLensBySlug } from '@/shared/lib/api/cmsPostsApi';
import { lensPath } from '@/shared/lib/content/lensUrl';

// 이 라우트는 렌더링하지 않고 정본 경로(/{category}/{yyyy}/{mm}/{dd}/{slug})로 리다이렉트만 한다.
// /lens/:slug → /:slug(구 리다이렉트, next.config.ts)를 거쳐 들어오는 요청도 한 번에 정리한다.
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
  // 영구 이동(308) — redirect()는 307(임시)이라 구글이 옛 주소를 색인에 남길 수 있다.
  permanentRedirect(lensPath(lens));
}
