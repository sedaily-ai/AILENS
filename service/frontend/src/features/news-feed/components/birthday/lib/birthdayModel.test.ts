import { afterEach, beforeEach, test, vi } from 'vitest';
import assert from 'node:assert/strict';
import raw from '../data/birthdaySnapshot.json';
import { EVENTS } from '@/shared/data/timelineEvents';
import { parseDate, anniversary, wageAt, pensionAt, pensionCalendar, ageOn, calculate, comparableAnnual, shareUrl, sharedYear } from './birthdayModel';

const snapshot = { ...raw, events: EVENTS };

test('실제 날짜만 허용하고 미래·1900년 이전·주입 문자열을 거부한다', () => {
  for (const input of ['1900-02-29', '2026-02-29', '2000-04-31', '2000-13-01', '2026-10-19', '1899-12-31', '1988-02-03<script>', '']) assert.equal(parseDate(input), null);
  assert.equal(parseDate('2000-02-29')!.day, 29);
  assert.equal(parseDate('2026-10-18')!.day, 18);
  assert.equal(anniversary(parseDate('2000-02-29')!, 65), '2065-02-28');
});

test('최저임금은 9월 시행 전후·2006년 연장·2027년 미시행을 구분한다', () => {
  assert.equal(wageAt('1987-12-31'), null);
  assert.equal(wageAt('1988-02-03'), 487.5);
  assert.equal(wageAt('1994-08-31'), 1085);
  assert.equal(wageAt('1994-09-01'), 1170);
  assert.equal(wageAt('2000-08-31'), 1600);
  assert.equal(wageAt('2000-09-01'), 1865);
  assert.equal(wageAt('2006-12-31'), 3100);
  assert.equal(wageAt('2026-10-18'), 10320);
});

test('기획안 생일의 실제 CPI로 환산하고 명목 현금과 구매력을 구별한다', () => {
  const result = calculate('1988-02-03', 'all', snapshot);
  assert.equal(result.cpi, 32.805);
  assert.ok(Math.abs(result.purchasingPower! - 272398.903927593) < 0.01);
  assert.equal(result.rows.find(row => row.id === 'cpi')!.change, '3.67배');
  assert.equal(result.rows.find(row => row.id === 'minimum-wage')!.change, '21.17배');
  assert.equal(result.rows.length, 18);
  assert.equal(new Set(result.rows.map(row => row.id)).size, 18);
  assert.equal(result.rows.find(row => row.id === 'samsung')!.state, 'pending');
});

test('월자료가 없는 생일은 연평균이라고 표시하고 결측을 0으로 만들지 않는다', () => {
  const annual = calculate('2000-09-01', 'all', snapshot);
  assert.equal(annual.cpiPeriod, '2000년 연평균');
  assert.equal(annual.cpi, snapshot.cpi.find(point => point.period === '2000')!.value);
  const old = calculate('1940-01-01', 'all', snapshot);
  assert.equal(old.cpi, null);
  assert.equal(old.purchasingPower, null);
  assert.equal(old.rows.find(row => row.id === 'cpi')!.state, 'unavailable');
  const recent = calculate('2026-10-18', 'all', snapshot);
  assert.equal(recent.rows.find(row => row.id === 'gold-ring')!.before, '아직 첫돌 전');
  assert.equal(recent.chart.length, 0);
  assert.equal(comparableAnnual(recent).length, 0);
});

test('연금 제도 변곡점과 출생연도별 연령을 반영한다', () => {
  assert.equal(pensionAt(1987), null);
  assert.deepEqual(pensionAt(1988), { contribution: 3, replacement: 70 });
  assert.deepEqual(pensionAt(1993), { contribution: 6, replacement: 70 });
  assert.deepEqual(pensionAt(1998), { contribution: 9, replacement: 70 });
  assert.deepEqual(pensionAt(1999), { contribution: 9, replacement: 60 });
  assert.equal(pensionAt(2008)!.replacement, 50);
  assert.equal(pensionAt(2025)!.replacement, 41.5);
  assert.deepEqual(pensionAt(2026), { contribution: 9.5, replacement: 43 });
  assert.equal(pensionCalendar(parseDate('1952-01-01')!), null);
  for (const [year, age] of [[1953, 61], [1957, 62], [1961, 63], [1965, 64], [1969, 65]]) assert.equal(pensionCalendar(parseDate(`${year}-01-01`)!)![1].age, age);
  assert.deepEqual(pensionCalendar(parseDate('1988-02-03')!)!.map(point => point.date), ['2048-02-03', '2053-02-03', '2058-02-03']);
});

test('공유는 기본 연도만 포함하고 동일 연간 기간의 실제 비교값만 사용한다', () => {
  const result = calculate('1988-02-03', 'female', snapshot);
  assert.equal(shareUrl('http://localhost:3001/?secret=1#old', result), 'http://localhost:3001/birthday-market#birthday-year=1988');
  assert.equal(shareUrl('https://ailens.sedaily.ai/birthday-market?sex=female#date=1988-02-03', result), 'https://ailens.sedaily.ai/birthday-market#birthday-year=1988');
  const comparable = comparableAnnual(result);
  assert.equal(comparable.length, 2);
  assert.ok(comparable.every(item => item.period === '1988년 → 2025년 · 연간 기준'));
  assert.equal(comparable.find(item => item.id === 'cpi')!.before, snapshot.cpi.find(point => point.period === '1988')!.value);
  assert.ok(comparable[0].change >= comparable[1].change);
  assert.ok(comparableAnnual(calculate('2025-01-01', 'all', snapshot)).every(item => item.change === 0));
});

test('사건 당시 나이는 생일 전후를 구분한다', () => {
  assert.equal(ageOn('1988-02-03', '2000-02-02'), 11);
  assert.equal(ageOn('1988-02-03', '2000-02-03'), 12);
  const result = calculate('1988-02-03', 'male', snapshot);
  assert.ok(result.events.every(event => event.date >= '1988-02-03' && event.date <= '2026-10-18'));
});


test('공유 링크는 유효한 출생연도만 복원한다', () => {
  assert.equal(sharedYear('#birthday-year=1988'), '1988');
  for (const hash of ['#birthday-year=1899', '#birthday-year=2027', '#birthday-year=1988&date=1988-02-03', '#date=1988-02-03', '#birthday-year=<script>', '#birthday-history']) assert.equal(sharedYear(hash), null);
});

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-18T09:00:00Z')); });
afterEach(() => vi.useRealTimers());

test('한국 시간 자정에 입력 상한이 바뀌고 자료 기준일 이후 생일도 받는다', () => {
  vi.setSystemTime(new Date('2026-10-18T14:59:59Z'));
  assert.equal(parseDate('2026-10-19'), null);
  vi.setSystemTime(new Date('2026-10-18T15:00:00Z'));
  assert.equal(parseDate('2026-10-19')!.day, 19);
  assert.equal(parseDate('2026-10-20'), null);
  const result = calculate('2026-10-19', 'all', snapshot);
  assert.equal(result.cpi, null);
  assert.equal(result.rows.find(row => row.id === 'gold-ring')!.state, 'unavailable');
  vi.setSystemTime(new Date('2026-10-19T15:00:00Z'));
  assert.equal(calculate('2025-10-20', 'all', snapshot).rows.find(row => row.id === 'gold-ring')!.state, 'pending');
  vi.setSystemTime(new Date('2026-12-31T15:00:00Z'));
  assert.equal(sharedYear('#birthday-year=2027'), '2027');
  assert.equal(sharedYear('#birthday-year=2028'), null);
});
