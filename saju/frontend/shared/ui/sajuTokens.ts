/**
 * 점신 결 디자인 토큰 (phase-04, 2026-05-24)
 * 메인 랜딩에서 인라인으로 쓰던 것들을 재사용 단위로 분리.
 *
 * 기본은 globals.css 의 --saju-* CSS 변수를 쓰지만, JS 에서 직접 참조해야 할 때
 * (인라인 style, gradient stop 등) 이 객체를 import.
 */

export const SAJU = {
  paper:      '#FFFFFF',
  paperSoft:  '#FFFFFF',
  card:       '#FFFFFF',
  ink:        '#1A1A1A',
  inkSoft:    '#4F4F58',
  inkSub:     '#A0A0A8',
  inkMute:    '#8C8579',
  line:       '#E5E7EB',
  warm:       '#34D399',
  warmSoft:   '#D1FAE5',
  warmDeep:   '#059669',
  cream:      '#D1FAE5',
  rose:       '#D1FAE5',
  roseDeep:   '#059669',
  lilac:      '#D1FAE5',
  lilacDeep:  '#059669',
  mint:       '#D1FAE5',
  mintDeep:   '#059669',
} as const;

/** 명조체 (한자·헤딩 강조용). globals.css 안 건드림, 시스템 fallback chain. */
export const SERIF = '"Noto Serif KR", "Nanum Myeongjo", "Apple SD Gothic Neo", serif';

/** 한지 노이즈 (SVG turbulence, 인라인 data URL — 외부 요청 0) */
export const HANJI_NOISE =
  "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='220' height='220'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.35  0 0 0 0 0.27  0 0 0 0 0.18  0 0 0 0.06 0'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")";

/** 점신 키프레임 — PageShell 에서 한 번만 inject */
export const SAJU_KEYFRAMES = `
  @keyframes saju-spin {
    from { transform: rotate(0deg); }
    to   { transform: rotate(360deg); }
  }
  @keyframes saju-pulse {
    0%, 100% { transform: scale(1);    opacity: 1; }
    50%      { transform: scale(1.06); opacity: 0.92; }
  }
  @keyframes saju-twinkle {
    0%, 100% { opacity: 0.6; transform: scale(1); }
    50%      { opacity: 1;   transform: scale(1.18); }
  }
`;
