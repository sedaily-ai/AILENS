// "요즘 많이 나오는 이야기" 추이 계산 — 순수 함수(저장소·React·네트워크 없음).
// 기준은 독자 조회가 아니라 우리 기사에 그 주제가 나온 빈도다(이름에 "인기"를 쓰지 않는 이유).
import { matches, type Interest, type RecLike } from './match';

const DAY = 86400000;
const pad = (n: number) => String(n).padStart(2, '0');
/** 한국 날짜 YYYY-MM-DD (UTC 에 9시간을 더해 계산). */
export const kstDay = (ms: number): string => {
  const d = new Date(ms + 9 * 3600000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
};

/** 오래된 날 → 오늘 순서로 days 개 날짜 키. */
export function dayKeys(days: number, now = Date.now()): string[] {
  return Array.from({ length: days }, (_, i) => kstDay(now - (days - 1 - i) * DAY));
}

/** 주제에 맞는 기사 수를 날짜별로 센다(길이 days, 마지막이 오늘). */
export function dailySeries(it: Interest, recs: RecLike[], slugOf: (c?: string) => string | null, days = 10, now = Date.now()): number[] {
  const keys = dayKeys(days, now);
  const idx = new Map(keys.map((k, i) => [k, i]));
  const out = new Array<number>(days).fill(0);
  for (const r of recs) {
    const i = idx.get(r.d);
    if (i === undefined) continue;
    if (matches(it, r, slugOf)) out[i]++;
  }
  return out;
}

export type TrendKind = 'rising' | 'steady' | 'quiet';
export interface Trend {
  it: Interest;
  /** 최근 7일(오래된 날 → 오늘). */
  spark: number[];
  recent: number;
  /** 직전 구간을 같은 3일 길이로 환산한 기준선. */
  base: number;
  kind: TrendKind;
}

/**
 * series: 길이 10 이상(마지막이 오늘). 최근 3일 합 대비 그 앞 7일을 3일치로 환산한 기준선을 비교한다.
 * 급상승: 최근 3건 이상이고 기준선의 1.6배 이상(기준선이 0.5 미만이면 0.5로 본다). 꾸준: 최근 2건 이상. 나머지는 주춤.
 */
export function classify(series: number[]): { recent: number; base: number; kind: TrendKind } {
  const n = series.length;
  const recent = series.slice(n - 3).reduce((a, b) => a + b, 0);
  const prior = series.slice(Math.max(0, n - 10), n - 3);
  const base = prior.length ? (prior.reduce((a, b) => a + b, 0) / prior.length) * 3 : 0;
  if (recent >= 3 && recent >= 1.6 * Math.max(base, 0.5)) return { recent, base, kind: 'rising' };
  if (recent >= 2) return { recent, base, kind: 'steady' };
  return { recent, base, kind: 'quiet' };
}

export function trendOf(it: Interest, recs: RecLike[], slugOf: (c?: string) => string | null, now = Date.now()): Trend {
  const s = dailySeries(it, recs, slugOf, 10, now);
  const c = classify(s);
  return { it, spark: s.slice(3), ...c };
}

/**
 * 후보 주제들에서 "요즘 뜨는" 순위. 급상승을 증가량(recent - base) 순으로, 모자라면 꾸준한 것을 최근 건수 순으로 채운다.
 * 너무 포괄적인 말(미국·중국처럼 늘 많이 나오는 것)은 기준선이 높아 급상승에서 자연스레 빠진다.
 */
export function rankTrends(cands: Interest[], recs: RecLike[], slugOf: (c?: string) => string | null, limit = 6, now = Date.now()): Trend[] {
  const all = cands.map((it) => trendOf(it, recs, slugOf, now));
  const rising = all.filter((t) => t.kind === 'rising').sort((a, b) => b.recent - b.base - (a.recent - a.base) || b.recent - a.recent);
  const steady = all.filter((t) => t.kind === 'steady').sort((a, b) => b.recent - a.recent);
  return [...rising, ...steady].slice(0, limit);
}

/** 이번 주(최근 7일) 대 지난주(그 앞 7일) 기사 수. 내 관심의 흐름에 쓴다. */
export function weekly(it: Interest, recs: RecLike[], slugOf: (c?: string) => string | null, now = Date.now()): { thisWeek: number; lastWeek: number; spark: number[] } {
  const s = dailySeries(it, recs, slugOf, 14, now);
  const sum = (a: number[]) => a.reduce((x, y) => x + y, 0);
  return { thisWeek: sum(s.slice(7)), lastWeek: sum(s.slice(0, 7)), spark: s.slice(7) };
}
