const PUBLIC_SITE = "https://ailens.sedaily.ai";

// letters/webtoon/lens만 공개 사이트에 상세 페이지가 있다(service/frontend/src/app/
// {letters,webtoon,lens}/[.../]page.tsx) — trend_card/video는 홈 화면 카드로만
// 노출되고 개별 URL이 없다(2026-08-09 확인, ColumnPreviewSection.tsx가
// trend_card 채널 항목엔 href를 아예 안 붙이는 것과 동일 결론).
export function publicPostUrl(post: { slug: string; channels: string[] }): string | null {
  if (post.channels.includes("webtoon")) return `${PUBLIC_SITE}/webtoon/${encodeURIComponent(post.slug)}`;
  if (post.channels.includes("lens")) return `${PUBLIC_SITE}/lens/${encodeURIComponent(post.slug)}`;
  if (post.channels.includes("trend_card") || post.channels.includes("video")) return null;
  return `${PUBLIC_SITE}/letters/${encodeURIComponent(post.slug)}`;
}

// AI 레터는 항상 letters 상세로 — 발행일·에디터·채널 편집이 안 되는 것과
// 같은 이유(파이프라인 산출물, PostForm mode="letter" 참조)로 draft 상태가
// 없어 늘 공개돼 있다.
export function publicLetterUrl(id: string): string {
  return `${PUBLIC_SITE}/letters/${encodeURIComponent(id)}`;
}
