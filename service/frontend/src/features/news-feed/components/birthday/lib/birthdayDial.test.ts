import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { dateFromDigits, dialDate, monthDays } from './birthdayDial';

test('다이얼로 연도·월을 바꿀 때 윤년과 월말을 맞춘다', () => {
  expect(monthDays(2000, 2)).toBe(29);
  expect(monthDays(1900, 2)).toBe(28);
  expect(dialDate(2000, 2, 31)).toBe('2000-02-29');
  expect(dialDate(2001, 2, 29)).toBe('2001-02-28');
  expect(dialDate(1988, 4, 31)).toBe('1988-04-30');
});

test('다이얼은 1900년 시작과 한국 시간 오늘 범위를 지킨다', () => {
  expect(dialDate(1899, 1, 1)).toBe('1900-01-01');
  expect(dialDate(2026, 12, 31)).toBe('2026-10-18');
  expect(dialDate(2026, 9, 30)).toBe('2026-09-30');
  expect(dialDate(2025, 12, 31)).toBe('2025-12-31');
});

test('직접 입력은 숫자 8자리만 받고 잘못된 날짜를 자동으로 다른 생일로 바꾸지 않는다', () => {
  expect(dateFromDigits('20000229')).toBe('2000-02-29');
  expect(dateFromDigits('2000. 02. 29')).toBe('2000-02-29');
  expect(dateFromDigits('20010229')).toBe('2001-02-29');
  expect(dateFromDigits('198802031234')).toBe('1988-02-03');
  expect(dateFromDigits('19880')).toBe('1988-0');
  expect(dateFromDigits('')).toBe('');
});

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-18T09:00:00Z')); });
afterEach(() => vi.useRealTimers());

test('다이얼 상한은 날짜·연도 변경과 윤년에도 오늘을 따른다', () => {
  vi.setSystemTime(new Date('2026-10-18T15:00:00Z'));
  expect(dialDate(2026, 10, 19)).toBe('2026-10-19');
  expect(dialDate(2026, 10, 20)).toBe('2026-10-19');
  vi.setSystemTime(new Date('2026-12-31T15:00:00Z'));
  expect(dialDate(2027, 12, 31)).toBe('2027-01-01');
  expect(dialDate(2028, 2, 29, '2028-02-29')).toBe('2028-02-29');
  expect(dialDate(2028, 2, 30, '2028-02-29')).toBe('2028-02-29');
});
