// 딥네이비 톤. 영상 프롬프트(docs/prompt/video/v3.0, §7 디자인)가 정본이다:
// 배경 딥네이비 #0F1A2E, 글자 흰색, 강조 앰버 #FFB020, 증가 빨강 #E5484D, 감소 파랑 #3E7BFA, 보조 회청색 #9AA8BF.
// 빨강·파랑은 좋고 나쁨이 아니라 방향(증가·감소)이다. 한 화면에 강조색은 하나.
export const COLORS = {
  background: '#0F1A2E',
  // 아이콘 원·카드 배경 — 프롬프트의 "나머지 땅" 색(#1E2A44)과 같은 한 단계 밝은 네이비.
  backgroundLight: '#1E2A44',
  text: '#FFFFFF',
  accent: '#FFB020',
  muted: '#9AA8BF',
  up: '#E5484D',
  down: '#3E7BFA',
} as const;
// 배경 그라디언트·점 격자는 components/BackgroundAtmosphere.tsx가 프레임에 따라 계산해서 그린다.

// 실제로 번들·로드하는 'Noto Sans KR'(lib/fonts.ts)을 1순위로 둔다. 뒤의 폴백은 macOS/Windows 전용이라
// 헤드리스 Linux 렌더에서는 쓰이지 않는다.
export const FONT_FAMILY =
  "'Noto Sans KR', -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif";

export const FONT_WEIGHT = {
  regular: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
  extrabold: 800,
} as const;

// 두 컴포지션(1080x1920, 1920x1080) 모두 짧은 변이 1080이므로
// min(width, height) / BASE_UNIT 을 스케일 기준으로 쓰면
// 같은 px 설계값이 두 포맷에서 동일한 상대 크기로 보인다.
export const BASE_UNIT = 1080;
