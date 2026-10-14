import { describe, expect, it } from 'vitest';
import { currentKstDay, readingPeriodRange } from './readingPeriod';

describe('읽기 기록의 한국 시간·주월연 경계', () => {
  it('UTC 날짜와 다른 한국 날짜를 기준으로 삼는다', () => {
    expect(currentKstDay(new Date('2026-10-13T15:00:00Z'))).toBe('2026-10-14');
    expect(currentKstDay(new Date('2026-10-13T14:59:59Z'))).toBe('2026-10-13');
  });
  it('연도를 넘는 월요일~일요일 주와 이전 주를 계산한다', () => {
    expect(readingPeriodRange('week', 0, '2027-01-01')).toMatchObject({ start: '2026-12-28', end: '2027-01-03', days: 7 });
    expect(readingPeriodRange('week', -1, '2027-01-01')).toMatchObject({ start: '2026-12-21', end: '2026-12-27' });
    expect(readingPeriodRange('week', 0, '2026-10-18').start).toBe('2026-10-12');
  });
  it('윤년·월말과 이전 연도 이동 시 일자를 넘기지 않는다', () => {
    expect(readingPeriodRange('month', -1, '2024-03-31')).toMatchObject({ start: '2024-02-01', end: '2024-02-29', days: 29, leadingDays: 3 });
    expect(readingPeriodRange('month', -1, '2026-03-31')).toMatchObject({ end: '2026-02-28', days: 28 });
    expect(readingPeriodRange('month', -1, '2026-01-31').start).toBe('2025-12-01');
    expect(readingPeriodRange('year', -1, '2026-10-14')).toMatchObject({ start: '2025-01-01', end: '2025-12-31', days: 365 });
  });
});
