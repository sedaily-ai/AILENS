import { BIGKINDS_MIN_DATE } from '@ailens/api-client';

const pad = (n: number) => String(n).padStart(2, '0');

/** 한국 오늘 'YYYY-MM-DD'. */
export function kstToday(now = Date.now()): string {
  const d = new Date(now + 9 * 3600 * 1000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** 'YYYY-MM-DD' 가 실제 달력상 존재하는 날짜인지. */
export function isValidDate(s: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.getUTCFullYear() === Number(m[1]) && d.getUTCMonth() === Number(m[2]) - 1 && d.getUTCDate() === Number(m[3]);
}

export function shiftDate(date: string, delta: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

export const clampDate = (date: string, today = kstToday()) => (date < BIGKINDS_MIN_DATE ? BIGKINDS_MIN_DATE : date > today ? today : date);

/** "1997년 12월 3일 수요일". */
export function longDate(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const wd = ['일', '월', '화', '수', '목', '금', '토'][new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay()];
  return `${y}년 ${m}월 ${d}일 ${wd}요일`;
}
