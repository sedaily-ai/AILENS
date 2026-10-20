import { expect, test } from 'vitest';
import { EVENTS } from '@/shared/data/timelineEvents';
import { BIRTHDAY_MOMENTS, HERO_MOMENT_ID } from './birthdayMoments';

test('순간 목록 — 연대기 사건은 연대기에 있고, 그 밖의 행사는 서로 다른 출처 2개와 실제 날짜를 갖는다', () => {
  const dates: string[] = [];
  for (const moment of BIRTHDAY_MOMENTS) {
    if ('chronicleId' in moment) {
      const event = EVENTS.find(item => item.id === moment.chronicleId);
      expect(event, moment.label).toBeDefined();
      dates.push(event!.date);
      continue;
    }
    expect(moment.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Number.isNaN(Date.parse(`${moment.date}T00:00:00Z`))).toBe(false);
    const hosts = moment.sources.map(source => new URL(source.url).host.replace(/^(www|m)\./, ''));
    expect(new Set(hosts).size, moment.label).toBe(2);
    if (moment.paperDate) expect(moment.paperDate >= moment.date).toBe(true);
    dates.push(moment.date);
  }
  // 날짜 순으로 적어 둔다(읽고 고치기 쉽게).
  expect([...dates].sort()).toEqual(dates);
  expect(BIRTHDAY_MOMENTS.some(moment => 'chronicleId' in moment && moment.chronicleId === HERO_MOMENT_ID)).toBe(true);
});
