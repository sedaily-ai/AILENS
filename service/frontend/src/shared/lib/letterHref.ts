/**
 * 레터 상세로의 클라이언트 내비게이션 href.
 *
 * 정적 export 는 `/letters/[id]` 를 **빌드 시점의 고정 id 만** prerender 한다
 * (mock 5/18~5/25). 라이브(오늘자) letterId 로 클라이언트 라우팅하면 RSC payload
 * (`/letters/{id}.txt`) 자리에 CloudFront SPA fallback HTML 이 와서 라우터가
 * 파싱하지 못하고 전환이 멈춘다(상단 진행바가 85%에서 정지).
 *
 * `/letters/view?id=` 는 동적 세그먼트가 없는 **정적 페이지 1개**라 어떤 id 로도
 * 안전하게 이동된다. prerender 된 `/letters/[id]` 페이지는 SEO·직접 진입용으로
 * 그대로 유지(sitemap·JSON-LD canonical).
 */
export function letterHref(letterId: string): string {
  return `/letters/view?id=${encodeURIComponent(letterId)}`;
}
