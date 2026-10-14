export type ReadingPeriod = 'week' | 'month' | 'year';

const DAY_MS = 86_400_000;
const iso = (date: Date) => date.toISOString().slice(0, 10);

export function currentKstDay(now = new Date()): string {
  return new Date(now.getTime() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

// UTC로 일자만 계산한다. 실제 이용 시각의 일자 판정·집계는 서버가 담당한다.
export function readingPeriodRange(period: ReadingPeriod, offset: number, today: string) {
  const base = new Date(`${today}T00:00:00Z`);
  const year = base.getUTCFullYear(), month = base.getUTCMonth();
  let start: Date, end: Date;
  if (period === 'week') {
    start = new Date(base.getTime() + (offset * 7 - (base.getUTCDay() + 6) % 7) * DAY_MS);
    end = new Date(start.getTime() + 6 * DAY_MS);
  } else if (period === 'month') {
    start = new Date(Date.UTC(year, month + offset, 1));
    end = new Date(Date.UTC(year, month + offset + 1, 0));
  } else {
    start = new Date(Date.UTC(year + offset, 0, 1));
    end = new Date(Date.UTC(year + offset, 11, 31));
  }
  const display = (date: Date) => `${date.getUTCFullYear()}.${String(date.getUTCMonth() + 1).padStart(2, '0')}.${String(date.getUTCDate()).padStart(2, '0')}`;
  const label = period === 'week' ? `${display(start)} – ${display(end)}` : period === 'month' ? `${start.getUTCFullYear()}년 ${start.getUTCMonth() + 1}월` : `${start.getUTCFullYear()}년`;
  return { start: iso(start), end: iso(end), label, leadingDays: (start.getUTCDay() + 6) % 7, days: Math.round((end.getTime() - start.getTime()) / DAY_MS) + 1 };
}
