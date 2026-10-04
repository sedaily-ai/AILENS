/**
 * 레터 상세로의 클라이언트 내비게이션 href.
 *
 * 한때 `/letters/view?id=` 워크어라운드를 썼다 — 정적 export에서 prerender
 * 안 된 id로 `/letters/[id]`에 RSC 클라이언트 네비게이션하면, `_rsc` 세그먼트
 * 캐시 미스 폴백 요청이 CloudFront에서 SPA fallback HTML을 받아 라우터가
 * 파싱을 못 하고 멈추는 버그가 있었다(상단 진행바 85%에서 정지). 원인은
 * CloudFront Function(`sedaily-mbti-letter-html-rewrite`)이 `_rsc` 쿼리가
 * 있어도 `.html`을 반환하고 있던 것 — 2026-08-07 `.txt`(RSC 페이로드)로
 * 분기하게 고쳐서 근본 해결됐다(경위:
 * docs/worklog/2026-08/2026-08-07-cloudfront-rsc-navigation-bug.md). 이제
 * prerender 여부와 무관하게 `/letters/[id]`로 바로 이동해도 안전하다 —
 * 경로 기반 URL이 SEO에도 맞다(같은 날 논의: 쿼리스트링 대신 경로).
 */
export function letterHref(letterId: string): string {
  return `/letters/${encodeURIComponent(letterId)}`;
}
