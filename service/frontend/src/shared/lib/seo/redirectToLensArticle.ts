import { notFound, permanentRedirect } from 'next/navigation';
import { lensPath } from '@/shared/lib/content/lensUrl';
import { findLensForChannelSlug } from '@/shared/lib/seo/lensCanonical';

/**
 * 웹툰·영상·오디오 전용 상세는 두지 않는다(2026-10-09). 같은 기사(lens)의 페이지가 유일한 정본이므로,
 * 옛 주소(/webtoon/{slug}, /video/{slug}, /listen/{slug})로 들어오면 대응하는 기사로 영구 이동(308)한다.
 * 색인·공유된 옛 링크를 살리려고 404가 아니라 이동으로 처리하고, 대응하는 기사가 없으면 실제 404를 준다.
 * 채널 접미사(-video/-podcast/-webtoon)가 붙은 옛 ID도 findLensForChannelSlug가 처리한다.
 */
export async function redirectToLensArticle(rawSlug: string): Promise<never> {
  const lens = await findLensForChannelSlug(decodeURIComponent(rawSlug));
  if (lens) permanentRedirect(lensPath(lens));
  notFound();
}
