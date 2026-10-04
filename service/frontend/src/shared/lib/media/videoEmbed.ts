/**
 * YouTube URL 파싱: watch?v=, youtu.be/, embed/ 세 형태를 지원한다.
 * admin/src/components/PostForm.tsx의 extractYouTubeId와 로직이 같다(admin·frontend가 별도 Next.js 빌드라 공유할 수 없다).
 */
function extractYouTubeId(url: string): string | null {
  const m = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
  );
  return m ? m[1] : null;
}

function youtubeThumbnailUrl(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}

function youtubeEmbedUrl(videoId: string): string {
  return `https://www.youtube.com/embed/${videoId}?autoplay=1`;
}

/**
 * 네이버TV: tv.naver.com/v/{id} 또는 /embed/{id} 형태에서 숫자 id를 뽑는다.
 * 유튜브와 달리 정적 썸네일 URL 규칙이 없어(oEmbed API 호출 필요) admin이 직접 넣은 thumbnail_url에 의존한다.
 */
function extractNaverTvId(url: string): string | null {
  const m = url.match(/tv\.naver\.com\/(?:v|embed)\/(\d+)/);
  return m ? m[1] : null;
}

function naverTvEmbedUrl(videoId: string): string {
  return `https://tv.naver.com/embed/${videoId}`;
}

type VideoPlatform = 'youtube' | 'navertv';

export interface ResolvedVideo {
  platform: VideoPlatform;
  videoId: string;
  embedUrl: string;
  /** 유튜브만 URL 규칙으로 자동 추출 가능 — 네이버TV는 null(admin 제공 썸네일에 의존). */
  autoThumbnailUrl: string | null;
}

/** video_url 하나로 플랫폼을 판별해 재생·썸네일에 필요한 값을 한 번에 계산. */
export function resolveVideo(url: string): ResolvedVideo | null {
  const ytId = extractYouTubeId(url);
  if (ytId) {
    return { platform: 'youtube', videoId: ytId, embedUrl: youtubeEmbedUrl(ytId), autoThumbnailUrl: youtubeThumbnailUrl(ytId) };
  }
  const naverId = extractNaverTvId(url);
  if (naverId) {
    return { platform: 'navertv', videoId: naverId, embedUrl: naverTvEmbedUrl(naverId), autoThumbnailUrl: null };
  }
  return null;
}

/**
 * mp3 등 오디오 파일 직접 URL 판별. resolveVideo()가 못 읽는 S3 원본 오디오 파일(YouTube/네이버TV가 아닌 것)을 구분한다.
 * TodayNewsPlayer.tsx·VideoLightbox.tsx도 같은 성격의 정규식(DIRECT_AUDIO_RE/DIRECT_FILE_RE)을 로컬로 갖고 있으며, 새 코드는 이 공용 함수를 쓴다.
 */
export function isDirectAudioUrl(url: string): boolean {
  return /\.(mp3|wav|m4a|aac|ogg)(\?|$)/i.test(url);
}

/**
 * mp4 등 영상 파일 직접 URL 판별. resolveVideo()는 유튜브/네이버TV만 읽으므로, mustknow_auto/frontpage_auto가 자체 렌더링해
 * S3에 올리는 mp4(video 채널 독립 글)를 /video/[slug](VideoViewClient.tsx)에서 재생하려면 이 판별이 필요하다.
 */
export function isDirectVideoUrl(url: string): boolean {
  return /\.(mp4|webm|mov)(\?|$)/i.test(url);
}
