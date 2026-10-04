// 연대기 탐험 화면의 배치 계산 — 날짜 → 가로 위치, 라벨 겹침 피하기, 시대 색. 순수 함수만.
import type { TimelineEvent } from '@/shared/data/timelineEvents';

export const START_YEAR = 1990;
export const END_YEAR = 2027; // 2026년 끝까지
export const PX_PER_YEAR = 150;
export const PAD_X = 110;

/** 'YYYY' · 'YYYY-MM' · 'YYYY-MM-DD' → 연 단위 소수(1997.89). 월 단위는 그 달의 가운데로 본다. */
export function yearFloat(date: string): number {
  const [y, m, d] = date.split('-').map((v) => parseInt(v, 10));
  if (!m) return y + 0.5;
  if (!d) return y + (m - 0.5) / 12;
  const start = Date.UTC(y, 0, 1);
  const days = (Date.UTC(y, m - 1, d) - start) / 86400000;
  return y + days / 365.25;
}

export const ROW_COUNT = 4;
const LABEL_GAP_PX = 132;
/** 이웃한 사건 사이 최소 가로 간격. 4줄을 돌려 쓰면 같은 줄의 간격이 4배(144px)가 되어 126px 라벨이 겹치지 않는다. */
const MIN_STEP_PX = 36;

export interface ChronicleLayout {
  width: number;
  /** 날짜 → 가로 위치. 사건이 몰린 구간(예: IMF 위기)은 사건 사이가 최소 간격 이상이 되도록 축이 늘어난다. */
  xOf: (date: string) => number;
  xOfYear: (year: number) => number;
  /** 사건 id → 라벨 줄 번호(0=축에서 가장 가까운 줄). */
  rows: Map<string, number>;
  /** 사건 id → 가로 위치. */
  xs: Map<string, number>;
}

/**
 * 연표 배치 — 연도는 일정한 폭으로 놓되, 사건이 몰린 곳은 최소 간격을 지키도록 오른쪽으로 밀고 그 변위를 축 전체에 부드럽게 반영한다.
 * 축이 비선형이라 연도 눈금과 시대 띠도 같은 함수(xOf)로 그려야 사건과 어긋나지 않는다.
 */
export function buildLayout(events: TimelineEvent[]): ChronicleLayout {
  const sorted = [...events].sort((a, b) => a.date.localeCompare(b.date));
  const lin = (yf: number) => PAD_X + (yf - START_YEAR) * PX_PER_YEAR;
  const pts: { yf: number; shift: number }[] = [];
  const xs = new Map<string, number>();
  let prevX = -Infinity;
  for (const e of sorted) {
    const yf = yearFloat(e.date);
    const x = Math.max(lin(yf), prevX + MIN_STEP_PX);
    pts.push({ yf, shift: x - lin(yf) });
    xs.set(e.id, x);
    prevX = x;
  }
  const shiftAt = (yf: number): number => {
    if (pts.length === 0 || yf <= pts[0].yf) return pts[0]?.shift ?? 0;
    const last = pts[pts.length - 1];
    if (yf >= last.yf) return last.shift;
    let i = 0;
    while (i + 1 < pts.length && pts[i + 1].yf <= yf) i++;
    const a = pts[i];
    const b = pts[i + 1];
    if (b.yf === a.yf) return a.shift;
    return a.shift + ((b.shift - a.shift) * (yf - a.yf)) / (b.yf - a.yf);
  };
  const xOf = (date: string) => {
    const yf = yearFloat(date);
    return lin(yf) + shiftAt(yf);
  };

  const lastX: number[] = Array(ROW_COUNT).fill(-Infinity);
  const rows = new Map<string, number>();
  for (const e of sorted) {
    const x = xs.get(e.id)!;
    let row = lastX.findIndex((l) => x - l >= LABEL_GAP_PX);
    if (row === -1) row = lastX.indexOf(Math.min(...lastX));
    lastX[row] = x;
    rows.set(e.id, row);
  }

  return { width: xOf(`${END_YEAR}-01-01`) + PAD_X, xOf, xOfYear: (y) => xOf(`${y}-01-01`), rows, xs };
}

const ERA_COLORS: Record<string, string> = {
  'imf-1997': '#b4432f',
  'global-financial-crisis-2008': '#5a4a8c',
  'covid-2020': '#2a7b8c',
  'rate-surge-2022': '#b7791f',
  'martial-law-2024': '#2f7d5b',
};
export const NEUTRAL_COLOR = '#5b6577';

export function eraColor(eraSlug?: string): string {
  return (eraSlug && ERA_COLORS[eraSlug]) || NEUTRAL_COLOR;
}
