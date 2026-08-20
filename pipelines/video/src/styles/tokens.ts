export const COLORS = {
  background: '#0F1A2E',
  backgroundLight: '#16223E',
  text: '#FFFFFF',
  accent: '#FFB020',
  muted: '#8A97A8',
} as const;

export const FONT_FAMILY =
  "'Pretendard', -apple-system, BlinkMacSystemFont, 'Apple SD Gothic Neo', 'Malgun Gothic', sans-serif";

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
