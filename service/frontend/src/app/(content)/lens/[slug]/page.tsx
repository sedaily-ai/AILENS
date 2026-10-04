import { permanentRedirect, notFound } from 'next/navigation';
import { fetchLensBySlug } from '@/shared/lib/api/cmsPostsApi';
import { lensPath } from '@/shared/lib/content/lensUrl';

// 옛 기사 주소 /lens/{slug}를 정본 /{category}/{yyyy}/{mm}/{dd}/{slug}로 한 번에 영구 이동(308)한다.
// 임시 이동(307)이 끼면 구글이 옛 주소를 색인에 남길 수 있고, 이동 단계가 길수록 크롤 예산이 낭비된다. 쿼리스트링(?v=4 등)은 버린다.
export const revalidate = 300;

export default async function LegacyLensRedirect({ params }: { params: Promise<{ slug: string }> }) {
  const { slug: rawSlug } = await params;
  const slug = decodeURIComponent(rawSlug);
  const lens = await fetchLensBySlug(slug);
  if (!lens) notFound();
  permanentRedirect(lensPath(lens));
}
