/**
 * 콘텐츠 상세 페이지 generateMetadata()의 title 필드용.
 *
 * layout.tsx의 title.template("%s | AI LENS")이 이미 브랜드명을 자동으로
 * 붙이므로, 여기서 또 붙이면 "...— AI LENS | AI LENS"처럼 중복된다
 * (2026-08-08 발견·수정된 버그). letters/webtoon/video/lens 4개 상세
 * 페이지가 각자 이 "붙이지 말 것" 규칙을 주석으로만 반복 기록하고 있어서
 * 한 곳으로 모았다 — 다음에 상세 페이지를 새로 추가할 때 같은 실수를
 * 다시 하기 쉬운 구조였다.
 */
export function buildPageTitle(baseTitle: string, typeSuffix?: string): string {
  return typeSuffix ? `${baseTitle} — ${typeSuffix}` : baseTitle;
}
