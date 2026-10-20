// 연대기 탐험 화면의 배치 계산 — 날짜 → 가로 위치, 라벨 겹침 피하기, 시대 색. 순수 함수만.

/** 'YYYY' · 'YYYY-MM' · 'YYYY-MM-DD' → 연 단위 소수(1997.89). 월 단위는 그 달의 가운데로 본다. */
export function yearFloat(date: string): number {
  const [y, m, d] = date.split('-').map((v) => parseInt(v, 10));
  if (!m) return y + 0.5;
  if (!d) return y + (m - 0.5) / 12;
  const start = Date.UTC(y, 0, 1);
  const days = (Date.UTC(y, m - 1, d) - start) / 86400000;
  return y + days / 365.25;
}

const ERA_COLORS: Record<string, string> = {
  'imf-1997': '#b4432f',
  'global-financial-crisis-2008': '#5a4a8c',
  'covid-2020': '#2a7b8c',
  'rate-surge-2022': '#a16207', // 흰 바탕 글자 4.92:1(기존 #b7791f는 3.64:1로 미달)
  'martial-law-2024': '#2f7d5b',
};
const NEUTRAL_COLOR = '#6b7280'; // Lens 보조 회색(TEXT_MUTED), 흰 바탕 4.83:1

export function eraColor(eraSlug?: string): string {
  return (eraSlug && ERA_COLORS[eraSlug]) || NEUTRAL_COLOR;
}
