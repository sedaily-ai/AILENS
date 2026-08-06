/**
 * YouTube URL 파싱 — watch?v=, youtu.be/, embed/ 세 형태 전부 지원.
 * admin/src/components/PostForm.tsx 의 extractYouTubeId 와 로직이 같다
 * (admin·frontend가 별도 Next.js 빌드라 공유 불가 — 이 저장소가 이미
 * cms_posts_ddb_client.py 등에서 감수하는 중복 패턴).
 */
export function extractYouTubeId(url: string): string | null {
  const m = url.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/,
  );
  return m ? m[1] : null;
}

export function youtubeThumbnailUrl(videoId: string): string {
  return `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
}

export function youtubeEmbedUrl(videoId: string): string {
  return `https://www.youtube.com/embed/${videoId}?autoplay=1`;
}
