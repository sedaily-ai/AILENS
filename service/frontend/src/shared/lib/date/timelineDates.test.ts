import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  addDays, digitsToValidDate, formatDateDigits, formatDateLabel, formatEventDate,
  fullYearsAgo, kdate, yearsAgoToday, ymd,
} from './timelineDates';

// "오늘"을 KST 2026-10-04로 고정
beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-04T03:00:00Z')); });
afterEach(() => vi.useRealTimers());

describe('timelineDates', () => {
  it('ymd: 로컬 날짜를 0 채워 표기', () => {
    expect(ymd(new Date(2026, 0, 5))).toBe('2026-01-05');
  });
  it('kdate / formatEventDate', () => {
    expect(kdate('2026-10-04')).toBe('2026년 10월 4일');
    expect(formatEventDate('1997-11-21')).toBe('1997년 11월 21일');
    expect(formatEventDate('1997-01')).toBe('1997년 1월');
    expect(formatEventDate('1997-11-21', '1997-12-03')).toBe('1997년 11월 21일 ~ 1997년 12월 3일');
  });
  it('formatDateLabel: 요일 포함, 파싱 실패는 원문', () => {
    expect(formatDateLabel('2026-10-04')).toBe('2026. 10. 4. (일)');
    expect(formatDateLabel('abc')).toBe('abc');
  });
  it('yearsAgoToday / fullYearsAgo', () => {
    expect(yearsAgoToday(10)).toBe('2016-10-04');
    expect(fullYearsAgo('1999-11-17')).toBe(26);
    expect(fullYearsAgo('2025-10-04')).toBe(1);
    expect(fullYearsAgo('2025-10-05')).toBe(0);
  });
  it('yearsAgoToday: 2/29는 28일로 보정', () => {
    vi.setSystemTime(new Date('2028-02-29T03:00:00Z'));
    expect(yearsAgoToday(1)).toBe('2027-02-28');
  });
  it('formatDateDigits / digitsToValidDate', () => {
    expect(formatDateDigits('1999')).toBe('1999');
    expect(formatDateDigits('199911')).toBe('1999 / 11');
    expect(formatDateDigits('19991117')).toBe('1999 / 11 / 17');
    expect(digitsToValidDate('19991117')).toBe('1999-11-17');
    expect(digitsToValidDate('19990231')).toBeNull();
    expect(digitsToValidDate('18991117')).toBeNull();
    expect(digitsToValidDate('20261005')).toBeNull();
    expect(digitsToValidDate('1999111')).toBeNull();
  });
  it('addDays: 월·연 경계', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01');
    expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
  });
});
