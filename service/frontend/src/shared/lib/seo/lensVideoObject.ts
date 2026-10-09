import type { CmsLens } from '@/shared/lib/api/cmsPostsApi';
import { resolveVideo } from '@/shared/lib/media/videoEmbed';

/**
 * 기사 페이지 JSON-LD용 VideoObject. 영상 형식이 있고 재생 가능한 주소(video_url)가 있을 때만 만든다 —
 * contentUrl/embedUrl이 없는 VideoObject는 구글이 오류로 처리한다. `/video/{slug}` 페이지는 canonical이 기사로 모이므로 영상 신호는 여기서 낸다.
 */
export function buildLensVideoObject(
  lens: CmsLens,
  opts: { url: string; headline: string; published: string; fallbackThumbnail: string },
): Record<string, unknown> | null {
  const item = lens.lenses.find((l) => l.label === '영상' && l.video_url);
  const videoUrl = item?.video_url;
  if (!item || !videoUrl) return null;
  const resolved = resolveVideo(videoUrl);
  const transcript = item.transcript?.trim();
  return {
    '@type': 'VideoObject',
    '@id': `${opts.url}#video`,
    name: opts.headline,
    description: lens.context || opts.headline,
    thumbnailUrl: item.thumbnail_url || resolved?.autoThumbnailUrl || opts.fallbackThumbnail,
    uploadDate: opts.published,
    contentUrl: videoUrl,
    ...(resolved?.embedUrl ? { embedUrl: resolved.embedUrl } : {}),
    ...(transcript ? { transcript } : {}),
    inLanguage: 'ko-KR',
    isFamilyFriendly: true,
  };
}
