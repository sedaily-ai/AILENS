export const COLORS = {
  background: '#0F1A2E',
  backgroundLight: '#16223E',
  text: '#FFFFFF',
  accent: '#FFB020',
  muted: '#8A97A8',
} as const;

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
