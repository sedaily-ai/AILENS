// 관심도 곡선 데이터 — 서울경제 기사 중 그 달에 키워드가 들어간 기사의 비중(빅카인즈 월별 total_hits ÷ 월 전체 기사 수).
// 아카이브 적재량이 달마다 달라 건수 대신 비중으로 그린다. 그 달 전체 기사가 MIN_TOTAL보다 적으면 값을 비우고 화면에 "적재 적음"으로 표시한다(예: 1998년 1~8월).
import { ATTENTION } from '@/shared/data/timelineAttention.generated';

export const ATT_KEYWORDS = ['IMF', '금리', '환율', '부동산', '주가'] as const;
type AttKeyword = (typeof ATT_KEYWORDS)[number];
export type AttKey = AttKeyword | 'TOTAL';

/** 이 건수 미만인 달은 비중이 흔들려 그리지 않는다. */
export const MIN_TOTAL = 400;
export const ATT_START_YEAR = 1990;

export interface AttPoint {
  /** 달의 가운데(연 단위 소수). */
  yf: number;
  /** 비중(%) 또는 TOTAL이면 기사 수. 값을 못 그리는 달은 null. */
  value: number | null;
  hits: number | null;
  total: number | null;
  /** 'YYYY-MM' */
  month: string;
}

const months: readonly string[] = ATTENTION.months;
const totals = ATTENTION.total as readonly (number | null)[];

function monthYf(month: string): number {
  const [y, m] = month.split('-').map((v) => parseInt(v, 10));
  return y + (m - 0.5) / 12;
}

const cache = new Map<AttKey, AttPoint[]>();

export function attentionSeries(key: AttKey): AttPoint[] {
  const hit = cache.get(key);
  if (hit) return hit;
  const raw = key === 'TOTAL' ? null : (ATTENTION.keywords as Record<string, readonly (number | null)[]>)[key];
  const pts = months.map((month, i): AttPoint => {
    const total = totals[i] ?? null;
    const hits = key === 'TOTAL' ? total : raw?.[i] ?? null;
    let value: number | null = null;
    if (key === 'TOTAL') value = total;
    else if (total !== null && total >= MIN_TOTAL && hits !== null) value = (hits / total) * 100;
    return { yf: monthYf(month), value, hits, total, month };
  });
  cache.set(key, pts);
  return pts;
}

/** 'YYYY-MM-DD' | 'YYYY-MM' → 월 인덱스(없으면 -1). */
function monthIndexOf(date: string): number {
  return months.indexOf(date.slice(0, 7));
}

export interface MonthReading {
  month: string;
  total: number | null;
  items: { key: AttKeyword; share: number | null; hits: number | null }[];
}

/** 한 달의 키워드별 비중 — 사건 패널의 "그 달 서울경제가 다룬 것". */
export function readMonth(date: string): MonthReading | null {
  const i = monthIndexOf(date);
  if (i < 0) return null;
  const total = totals[i] ?? null;
  return {
    month: months[i],
    total,
    items: ATT_KEYWORDS.map((key) => {
      const hits = (ATTENTION.keywords as Record<string, readonly (number | null)[]>)[key]?.[i] ?? null;
      return { key, hits, share: total !== null && total >= MIN_TOTAL && hits !== null ? (hits / total) * 100 : null };
    }),
  };
}

export const ATT_LABEL: Record<AttKey, string> = {
  IMF: 'IMF', 금리: '금리', 환율: '환율', 부동산: '부동산', 주가: '주가', TOTAL: '기사 수',
};
