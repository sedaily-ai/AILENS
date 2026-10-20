import { kstTodayStr } from '@/shared/lib/date/date';

export const FIRST_YEAR = 1900;

export function monthDays(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** 월·연도를 바꿔도 말일과 오늘을 넘는 생일이 생기지 않도록 맞춘다. */
export function dialDate(year: number, month: number, day: number, today = kstTodayStr()) {
  const lastDate = today.split('-').map(Number);
  const y = Math.min(lastDate[0], Math.max(FIRST_YEAR, year));
  const m = Math.min(y === lastDate[0] ? lastDate[1] : 12, Math.max(1, month));
  const lastDay = y === lastDate[0] && m === lastDate[1] ? lastDate[2] : monthDays(y, m);
  const d = Math.min(lastDay, Math.max(1, day));
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function dateFromDigits(value: string) {
  const digits = value.replace(/\D/g, '').slice(0, 8);
  return [digits.slice(0, 4), digits.slice(4, 6), digits.slice(6, 8)].filter(Boolean).join('-');
}
