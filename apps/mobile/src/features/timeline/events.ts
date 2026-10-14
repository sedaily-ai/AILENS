import { TIMELINE_EVENTS } from './events.generated';
import type { TimelineEvent } from './eventTypes';

export type { TimelineEvent } from './eventTypes';

export const DECADES = [
  { key: '2020s', label: '2020년대', from: 2020 },
  { key: '2010s', label: '2010년대', from: 2010 },
  { key: '2000s', label: '2000년대', from: 2000 },
  { key: '1990s', label: '1990년대', from: 1990 },
] as const;

/** 그날 신문을 볼 수 있는 사건(paperDate 가 있는 것), 최신 사건부터. 웹 getFeaturedEvents/decade 조회와 같은 데이터. */
export function eventsInDecade(from: number): TimelineEvent[] {
  return TIMELINE_EVENTS.filter((e) => e.paperDate && Number(e.date.slice(0, 4)) >= from && Number(e.date.slice(0, 4)) < from + 10).sort((a, b) =>
    b.date.localeCompare(a.date),
  );
}
