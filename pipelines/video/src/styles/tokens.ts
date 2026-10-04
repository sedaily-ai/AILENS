// 2026-10-03 — 딥네이비 톤으로 복귀. 사용자가 준 영상 프롬프트(docs/prompt/video/v3.0, §7 디자인)가 정본이다:
// 배경 딥네이비 #0F1A2E, 글자 흰색, 강조 앰버 #FFB020, 증가 빨강 #E5484D, 감소 파랑 #3E7BFA, 보조 회청색 #9AA8BF.
// (2026-09-02에 "흰색 배경 에듀테크 스타일" 요청으로 화이트 톤으로 바꿨던 것을 이번 프롬프트 기준으로 되돌린다.)
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
  // 지도(후속 작업)용
  land: '#1E2A44',
  border: '#2E3D5C',
} as const;
// 배경 그라디언트·점 격자는 components/BackgroundAtmosphere.tsx가 프레임에 따라 계산해서 그린다.

// 2026-08-23 — 'Pretendard'는 실제로 로드된 적이 한 번도 없어서(어디에도
// @font-face·폰트 파일이 없었음), 헤드리스 Linux 렌더 환경에서 모든
// 폴백(-apple-system 등, macOS/Windows 전용)이 실패하고 마지막
// sans-serif 제네릭에 우연히 걸리는 글리프만 렌더돼 한글이 군데군데
// 네모 박스로 깨졌다(같은 영상 안에서도 단어별로 되고 안 되고 갈림).
// 실제로 번들+로드하는 'Noto Sans KR'(lib/fonts.ts)을 1순위로 바꿨다.
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
