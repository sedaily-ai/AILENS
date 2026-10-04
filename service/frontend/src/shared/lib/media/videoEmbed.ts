/**
 * YouTube URL 파싱 — watch?v=, youtu.be/, embed/ 세 형태 전부 지원.
 * admin/src/components/PostForm.tsx 의 extractYouTubeId 와 로직이 같다
 * (admin·frontend가 별도 Next.js 빌드라 공유 불가 — 이 저장소가 이미
 * cms_posts_ddb_client.py 등에서 감수하는 중복 패턴).
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
 * 네이버TV 지원 추가(2026-08-11) — admin에서 tv.naver.com 링크를 붙여넣어도
 * 이 파일이 유튜브만 파싱해서 재생 버튼이 아무 반응 없던 버그를 발견하고
 * 고쳤다. tv.naver.com/v/{id} 또는 /embed/{id} 형태에서 숫자 id를 뽑는다.
 * 네이버TV는 유튜브처럼 정적 썸네일 URL 규칙이 없어(oEmbed API 호출이
 * 필요) — admin이 직접 넣은 thumbnail_url에 의존한다(admin UI에도 이미
 * 안내돼 있음).
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
 * mp3 등 오디오 파일 직접 URL 판별(2026-08-21, /listen 페이지 신설과 함께
 * 추가) — resolveVideo()가 못 읽는 S3 원본 오디오 파일(YouTube/네이버TV가
 * 아닌)을 구분한다. TodayNewsPlayer.tsx·VideoLightbox.tsx도 같은 성격의
 * 정규식을 각자 로컬로 갖고 있다(DIRECT_AUDIO_RE/DIRECT_FILE_RE) — 지금
 * 당장 셋을 하나로 합치진 않았고(이미 배포된 코드 손대는 리스크 대비 이득이
 * 작음), 새로 만드는 코드부터 이 공용 함수를 쓴다.
 */
export function isDirectAudioUrl(url: string): boolean {
  return /\.(mp3|wav|m4a|aac|ogg)(\?|$)/i.test(url);
}

/**
 * mp4 등 영상 파일 직접 URL 판별(2026-08-23) — resolveVideo()는 유튜브/
 * 네이버TV만 읽고, mustknow_auto/frontpage_auto가 자체 렌더링해서 S3에
 * 올리는 mp4(video 채널 독립 글, 오늘 신설)는 못 읽는다. /video/[slug]
 * (VideoViewClient.tsx)가 resolveVideo()만 보고 실패하면 무조건 "영상을
 * 준비 중이에요"만 띄우고 있었다 — 렌즈 4유형 페이지(AutoPlayVideo)는
 * 이미 이 경로를 따로 처리해서 정상 재생됐는데, 독립 video 채널 상세
 * 페이지만 이 분기가 없어서 실제로는 있는 영상을 못 보여주고 있었다.
 */
export function isDirectVideoUrl(url: string): boolean {
  return /\.(mp4|webm|mov)(\?|$)/i.test(url);
}
