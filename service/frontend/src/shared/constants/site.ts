// 사이트 루트 URL — 메타데이터·JSON-LD·sitemap/rss·canonical 등 21개 파일이
// 각자 `const SITE_URL = 'https://ailens.sedaily.ai'`로 재정의하고 있던 걸
// 여기로 통일(2026-08-23, 코드 리팩토링 감사에서 발견). 도메인이 바뀔 일은
// 거의 없지만, 21곳을 손으로 맞춰야 하는 리스크를 없앤다.
export const SITE_URL = 'https://ailens.sedaily.ai';
