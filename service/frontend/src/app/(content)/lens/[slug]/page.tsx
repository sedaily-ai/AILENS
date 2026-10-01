import { permanentRedirect, notFound } from 'next/navigation';
import { fetchLensBySlug } from '@/shared/lib/api/cmsPostsApi';
import { lensPath } from '@/shared/lib/lensUrl';

// 옛 기사 주소 /lens/{slug} -> 정본 /{category}/{yyyy}/{mm}/{dd}/{slug} 로 한 번에 영구 이동(308)(2026-10-01).
// 예전엔 next.config의 /lens/:slug -> /:slug(308) 뒤에 /{slug} 라우트의 redirect()(307, 임시)가 이어지는 2단 이동이었다 —
// 임시 이동이 끼면 구글이 옛 주소를 색인에 남길 수 있고, 이동이 길수록 크롤 예산도 낭비된다. 쿼리스트링(?v=4 등)은 버린다.
export const revalidate = 300;

export default async function LegacyLensRedirect({ params }: { params: Promise<{ slug: string }> }) {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug);
  const lens = await fetchLensBySlug(slug);
  if (!lens) notFound();
  permanentRedirect(lensPath(lens));
}
