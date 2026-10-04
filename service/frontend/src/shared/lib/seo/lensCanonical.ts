import { fetchLensBySlug, type CmsLens } from '@/shared/lib/api/cmsPostsApi';
import { lensPath } from '@/shared/lib/content/lensUrl';
import { SITE_URL } from '@/shared/constants/site';

// 한 기사(lens)가 웹툰·영상·오디오 페이지로도 열리는 구조라, 세 페이지는 본문 문장이 기사 페이지와 67~93% 겹친다
// (2026-10-01 Search Console 점검 — "크롤링됨 - 색인 미생성"이 가장 큰 미색인 사유). 검색 신호를 기사 페이지 한 곳으로 모으려고
// 이 페이지들의 정본(canonical)을 같은 기사의 lens 페이지로 지정한다. 페이지 자체는 독자를 위해 그대로 둔다.

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

/** 정본 URL — 대응하는 lens 글이 있으면 그 주소, 없으면 fallback(자기 주소). */
export function canonicalFromLens(lens: CmsLens | null, fallbackPath: string): string {
  return lens ? `${SITE_URL}${lensPath(lens)}` : `${SITE_URL}${fallbackPath}`;
}
