/**
 * 콘텐츠 상세 페이지 generateMetadata()의 title 필드용.
 *
 * layout.tsx의 title.template("%s | AI LENS")이 이미 브랜드명을 붙이므로 여기서 또 붙이면 "...— AI LENS | AI LENS"처럼 중복된다.
 * letters/webtoon/video/lens 상세 페이지가 이 "붙이지 말 것" 규칙을 한 곳에서 공유하도록 모았다.
 */
export function buildPageTitle(baseTitle: string, typeSuffix?: string): string {
  return typeSuffix ? `${baseTitle} — ${typeSuffix}` : baseTitle;
}
