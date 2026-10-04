/**
 * 레터 상세로의 클라이언트 내비게이션 href.
 *
 * `/letters/[id]` 경로 기반 URL로 바로 이동한다(prerender 여부와 무관하게 안전하며 SEO에도 맞다).
 * `_rsc` 요청에는 CloudFront Function(`sedaily-mbti-letter-html-rewrite`)이 `.html`이 아니라 `.txt`(RSC 페이로드)로 분기한다
 * (경위: docs/worklog/2026-08/2026-08-07-cloudfront-rsc-navigation-bug.md).
 */
export function letterHref(letterId: string): string {
  return `/letters/${encodeURIComponent(letterId)}`;
}
