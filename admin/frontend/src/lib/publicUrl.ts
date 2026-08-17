const PUBLIC_SITE = "https://ailens.sedaily.ai";

// letters/webtoon/lens만 공개 사이트에 상세 페이지가 있다(service/frontend/src/app/
// {letters,webtoon,lens}/[.../]page.tsx) — video는 홈 화면 카드로만 노출되고
// 개별 URL이 없다. trend_card 채널(과거 "카드 전용 글"용)은 2026-08-17
// 폐기 — "카드 전용" 글도 이제 channels:["letters"]로 저장되고(본문만
// 비어있는 얇은 상세 페이지), 여기 else 분기로 정상적으로 떨어진다
// (posts/edit/page.tsx save() 참조).
export function publicPostUrl(post: { slug: string; channels: string[] }): string | null {
  if (post.channels.includes("webtoon")) return `${PUBLIC_SITE}/webtoon/${encodeURIComponent(post.slug)}`;
  if (post.channels.includes("lens")) return `${PUBLIC_SITE}/lens/${encodeURIComponent(post.slug)}`;
  if (post.channels.includes("video")) return null;
  // "이슈 톡톡"(분류=issue_talk)도 channels는 그냥 letters라 별도 분기 없이
  // 여기로 떨어진다 — 인사이트와 동일.
  return `${PUBLIC_SITE}/letters/${encodeURIComponent(post.slug)}`;
}

// AI 레터는 항상 letters 상세로 — 발행일·에디터·채널 편집이 안 되는 것과
// 같은 이유(파이프라인 산출물, PostForm mode="letter" 참조)로 draft 상태가
// 없어 늘 공개돼 있다.
export function publicLetterUrl(id: string): string {
  return `${PUBLIC_SITE}/letters/${encodeURIComponent(id)}`;
}
