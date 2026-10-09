import { fetchLensBySlug, type CmsLens } from '@/shared/lib/api/cmsPostsApi';

// 웹툰·영상·오디오 옛 주소(/webtoon/{slug} 등)를 같은 기사(lens)로 잇는 조회. 사용처: redirectToLensArticle.ts.

/** 채널별 접미사(-video / -podcast / -webtoon)가 붙은 옛 ID에서 lens ID를 뽑는다. 접미사가 없으면 그대로. */
function lensIdFromChannelId(id: string): string {
  return id.replace(/-(video|podcast|webtoon)$/, '');
}

/** 채널 글 slug에 대응하는 lens 글 — 같은 ID 먼저, 없으면 접미사를 뗀 ID. 없으면 null. */
export async function findLensForChannelSlug(slug: string): Promise<CmsLens | null> {
  const direct = await fetchLensBySlug(slug);
  if (direct) return direct;
  const stripped = lensIdFromChannelId(slug);
  return stripped !== slug ? fetchLensBySlug(stripped) : null;
}
