// lens("4가지 시선") 글에 실려있는 웹툰·영상 서브포맷을, 홈의 전용 "영상으로
// 보는 이슈"(VideoPreviewSection)·"이슈를 웹툰으로"(WebtoonPreviewSection)
// 섹션에도 섞어 넣기 위한 변환 함수(2026-08-20, 사용자 요청 — "저희가 올린
// 시선쪽 소스를 사용해주세요.. 거기에도 쌓이게 해야합니다").
//
// 이 두 섹션은 원래 각자 독립 채널(webtoon/video)만 봤는데, 앞으로 발행되는
// 콘텐츠는 전부 lens 4포맷으로 나가면서 그 독립 채널들은 새 글이 뜸해질
// 예정이다 — app/page.tsx의 "최신 뉴스" 그리드에 lens를 섞은 것과 같은
// 이유·같은 패턴.
//
// lens.lenses[]의 순서는 LENS_FORMATS(레터→웹툰→팟캐스트→영상)로 고정이라
// 인덱스로 바로 찾는다(lensPerspectives.ts 상단 경고 참조).
import type { CmsLens, CmsVideo, CmsWebtoon } from './api/cmsPostsApi';

const WEBTOON_INDEX = 1;
const VIDEO_INDEX = 3;

function firstBullet(bullets?: string[]): string {
  return (bullets ?? []).find((b) => b && b.trim()) ?? '';
}

/** lens 글 중 웹툰 컷(images)이 실제로 있는 것만 CmsWebtoon 모양으로 변환. */
export function buildLensWebtoonItems(lens: CmsLens[]): CmsWebtoon[] {
  const out: CmsWebtoon[] = [];
  for (const l of lens) {
    const item = (l.lenses ?? [])[WEBTOON_INDEX];
    const images = item?.images;
    if (!images || images.length === 0) continue;
    out.push({
      id: `lens-${l.id}`,
      editor_id: 'AI LENS',
      title: l.headline,
      excerpt: item.question || firstBullet(item.bullets),
      date: l.date,
      cover_image_url: images[0].url,
      panels: images,
      is_cms: true,
      href: `/lens/${encodeURIComponent(l.id)}?v=${WEBTOON_INDEX + 1}`,
    });
  }
  return out;
}

/** lens 글 중 영상(video_url)이 실제로 있는 것만 CmsVideo 모양으로 변환. */
export function buildLensVideoItems(lens: CmsLens[]): CmsVideo[] {
  const out: CmsVideo[] = [];
  for (const l of lens) {
    const item = (l.lenses ?? [])[VIDEO_INDEX];
    const url = item?.video_url;
    if (!url) continue;
    out.push({
      id: `lens-${l.id}`,
      title: item.question || l.headline,
      excerpt: firstBullet(item.bullets),
      date: l.date,
      video_url: url,
      // 영상 프레임(item.thumbnail_url)을 최우선으로 — YouTube 채널 영상은
      // 자동으로 영상 프레임 썸네일이 뜨는데(resolveVideo), lens 영상만 기사
      // 사진(photo_image_url)으로 떠서 "영상 콘텐츠인데 기사 사진이 뜬다"는
      // 지적을 받았다(2026-08-20). 프레임을 아직 못 뽑은 글만 기사 사진 →
      // cover_image_url 순으로 폴백.
      thumbnail_url: item.thumbnail_url || l.photo_image_url || l.cover_image_url || null,
      is_cms: true,
      href: `/lens/${encodeURIComponent(l.id)}?v=${VIDEO_INDEX + 1}`,
    });
  }
  return out;
}

/** 두 배열을 합쳐 date 내림차순으로 정렬 — 채널 원본과 lens 파생을 뒤섞어 보여준다. */
export function mergeByDateDesc<T extends { date: string }>(a: T[], b: T[]): T[] {
  return [...a, ...b].sort((x, y) => y.date.localeCompare(x.date));
}
