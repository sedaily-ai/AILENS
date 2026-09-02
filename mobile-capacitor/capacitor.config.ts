import type { CapacitorConfig } from '@capacitor/cli';

// 이 앱은 SSR이다(service/frontend/next.config.ts의 output:"standalone" —
// 관리자 발행이 재빌드 없이 즉시 반영돼야 함). 그래서 Capacitor 기본 모드
// (로컬에 정적 웹 번들을 담아 배포)가 아니라 server.url로 라이브 도메인을
// 직접 가리키는 "원격 URL 모드"를 쓴다 — 지금 mobile/(TWA)이 하는 것과
// 같은 방식이고, Capacitor 공식 지원 패턴이다. webDir("www")의 로컬
// index.html은 server.url이 있으면 실제로는 안 쓰인다 — 오프라인/로딩
// 실패 시 폴백용 placeholder일 뿐.
const config: CapacitorConfig = {
  appId: 'ai.sedaily.lens',
  appName: 'AI LENS',
  webDir: 'www',
  server: {
    url: 'https://ailens.sedaily.ai',
    androidScheme: 'https',
  },
};

export default config;
