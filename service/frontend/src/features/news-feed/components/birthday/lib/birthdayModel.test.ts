import { afterEach, beforeEach, test, vi } from 'vitest';
import assert from 'node:assert/strict';
import raw from '../data/birthdaySnapshot.json';
import { EVENTS } from '@/shared/data/timelineEvents';
import { parseDate, anniversary, wageAt, pensionCalendar, ageOn, calculate, shareUrl, sharedYear, manwon, elapsedLabel, hundredMillionNow } from './birthdayModel';

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

test('확인된 숫자만 계산한다 — 최저시급·물가·연금', () => {
  const result = calculate('1988-02-03', snapshot);
  assert.equal(result.cpi, 32.805);
  assert.equal(result.wage, 487.5);
  assert.ok(Math.abs(hundredMillionNow(result.cpi!) - 367_108_672.457) < 1);
});

test('그 순간, 나는 몇 살 — 국민적 순간 최대 3개, 월드컵을 겪었으면 월드컵이 제목, 아니면 만 12세에 가까운 순간', () => {
  const rows = (date: string, mode: 'personal' | 'year' = 'personal') => {
    const result = calculate(date, snapshot, mode);
    return { hero: result.heroAge?.title ?? null, ages: result.ages.map(event => [event.title, event.age ?? `${event.yearsAfter}년 뒤`]) };
  };
  assert.deepEqual(rows('1988-02-03'), { hero: '2002 한일 월드컵 개막', ages: [['대전 엑스포 개막', 5], ['2002 한일 월드컵 개막', 14], ['한강 노벨문학상', 36]] });
  // 만 0세 순간(대전 엑스포 개막)은 빼고 그다음 이른 순간(OECD 가입)을 쓴다.
  assert.deepEqual(rows('1993-01-01'), { hero: '2002 한일 월드컵 개막', ages: [['OECD 가입', 3], ['2002 한일 월드컵 개막', 9], ['한강 노벨문학상', 31]] });
  assert.deepEqual(rows('1996-06-01'), { hero: '2002 한일 월드컵 개막', ages: [['박세리 US여자오픈 우승', 2], ['2002 한일 월드컵 개막', 5], ['한강 노벨문학상', 28]] });
  assert.deepEqual(rows('1996-06-01', 'year'), { hero: '2002 한일 월드컵 개막', ages: [['박세리 US여자오픈 우승', '2년 뒤'], ['2002 한일 월드컵 개막', '6년 뒤'], ['한강 노벨문학상', '28년 뒤']] });
  // 가장 이른 순간(인천공항 개항, 월드컵과 1년 차이)이 간격에 걸리면 고른 범위 한가운데에 가까운 순간을 쓴다.
  assert.deepEqual(rows('1999-03-01'), { hero: '2002 한일 월드컵 개막', ages: [['2002 한일 월드컵 개막', 3], ['김연아 밴쿠버 금메달', 10], ['한강 노벨문학상', 25]] });
  // 월드컵 뒤에 태어나면 만 12세에 가장 가까운 순간이 제목이다.
  assert.deepEqual(rows('2005-03-01'), { hero: '평창 동계올림픽 개막', ages: [['김연아 밴쿠버 금메달', 4], ['평창 동계올림픽 개막', 12], ['한강 노벨문학상', 19]] });
  assert.deepEqual(rows('2015-01-01'), { hero: '한강 노벨문학상', ages: [['평창 동계올림픽 개막', 3], ['기생충 아카데미 작품상', 5], ['한강 노벨문학상', 9]] });
  assert.deepEqual(rows('2022-05-01'), { hero: '한강 노벨문학상', ages: [['한강 노벨문학상', 2]] });
  // 만 1세가 되기 전 순간뿐이면 장면을 숨긴다.
  assert.deepEqual(rows('2024-01-01'), { hero: null, ages: [] });
  // 위기·참사·정치 사건과 코스피 이정표는 나오지 않는다.
  const dates = ['1940-01-01', '1990-01-01', '1993-01-01', '1996-06-01', '1997-11-01', '1999-03-01', '2002-08-01', '2005-03-01', '2009-01-01', '2010-06-01', '2015-01-01', '2020-01-01'];
  const all = dates.flatMap(date => calculate(date, snapshot).ages);
  const banned = ['1997-11-21-1', '2008-09-15-1', '2020-03-19-1', '2024-12-03-1', '1993-08-12-1', '2007-07-25-1', '2021-01-06-1', '2025-10-27-1', '2026-01-27-1'];
  assert.ok(all.every(event => !banned.includes(event.id)));
  // 연대기 사건은 연대기의 그 사건으로(id가 연대기에 실제로 있음), 그 밖의 행사는 그날 신문으로, 그날 신문이 없는 박세리 우승만 링크가 없다.
  for (const event of all) {
    if (event.link?.label === '연대기에서 보기') {
      assert.ok(EVENTS.some(item => item.id === event.id));
      assert.equal(event.link.href, `/timeline/chronicle?e=${event.id}`);
    } else if (event.link) assert.match(event.link.href, /^\/timeline\/\d{4}-\d{2}-\d{2}$/);
    else assert.equal(event.title, '박세리 US여자오픈 우승');
  }
});

test('월자료가 없는 생일은 연평균이라고 표시하고 결측을 0으로 만들지 않는다', () => {
  const annual = calculate('2000-09-01', snapshot);
  assert.equal(annual.cpiPeriod, '2000년 연평균');
  assert.equal(annual.cpi, snapshot.cpi.find(point => point.period === '2000')!.value);
  const old = calculate('1940-01-01', snapshot);
  assert.equal(old.cpi, null);
  assert.equal(old.wage, null);
  assert.equal(old.calendar, null);
});

test('연금 달력은 해당 나이 생일의 다음 달 개시·70/100/136·손익분기 나이를 낸다(기획안 v3 예시)', () => {
  const calendar = pensionCalendar(parseDate('2000-03-18')!)!;
  assert.deepEqual(calendar.points.map(point => [point.age, point.start, point.ratio]), [[60, '2060-04', 70], [65, '2065-04', 100], [70, '2070-04', 136]]);
  assert.deepEqual(calendar.breakEven, { early: { years: 76, months: 8 }, late: { years: 83, months: 11 } });
  assert.deepEqual(pensionCalendar(parseDate('1999-12-05')!)!.points[1].start, '2065-01');
  assert.equal(pensionCalendar(parseDate('1952-01-01')!), null);
  for (const [year, age] of [[1953, 61], [1957, 62], [1961, 63], [1965, 64], [1969, 65]]) assert.equal(pensionCalendar(parseDate(`${year}-01-01`)!)!.points[1].age, age);
  assert.deepEqual(pensionCalendar(parseDate('1960-06-01')!)!.breakEven, { early: { years: 73, months: 8 }, late: { years: 80, months: 11 } });
});

test('공유 링크는 연도만 담는다', () => {
  const result = calculate('1988-02-03', snapshot);
  assert.equal(shareUrl('http://localhost:3001/?secret=1#old', result), 'http://localhost:3001/birthday-market#birthday-year=1988');
  assert.equal(shareUrl('https://ailens.sedaily.ai/birthday-market?sex=female#date=1988-02-03', result), 'https://ailens.sedaily.ai/birthday-market#birthday-year=1988');
});

test('금액·기간 표기', () => {
  assert.equal(manwon(10_850_000), '1,085만 원');
  assert.equal(manwon(1_607_390_000), '16억 739만 원');
  assert.equal(manwon(200_000_000), '2억 원');
  assert.equal(manwon(3_200), '3,200원');
  assert.equal(elapsedLabel('2000-03-18', '2026-10-19'), '26년 7개월');
  assert.equal(elapsedLabel('2000-03-20', '2026-10-19'), '26년 6개월');
  assert.equal(elapsedLabel('2026-09-01', '2026-10-19'), '1개월');
});

test('사건 당시 나이는 생일 전후를 구분한다', () => {
  assert.equal(ageOn('1988-02-03', '2000-02-02'), 11);
  assert.equal(ageOn('1988-02-03', '2000-02-03'), 12);
  const result = calculate('1988-02-03', snapshot);
  assert.ok(result.ages.every(event => event.date >= '1988-02-03' && event.date <= '2026-10-18'));
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
  const result = calculate('2026-10-19', snapshot);
  assert.equal(result.cpi, null);
  vi.setSystemTime(new Date('2026-12-31T15:00:00Z'));
  assert.equal(sharedYear('#birthday-year=2027'), '2027');
  assert.equal(sharedYear('#birthday-year=2028'), null);
});
