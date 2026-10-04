// 코스피 이정표 — 데이터에 실린 검증된 사건 설명에서 종가가 확인된 날만 점으로 찍는다.
// 일부러 이어 그리지 않는다: 이정표 사이의 값은 확인한 적이 없어서 선을 이으면 없는 데이터를 만들게 된다.
// 값의 출처는 각 사건의 출처(shared/data/timelineEvents.generated.ts의 sources). 종가 기준, 단위 포인트.
export interface KospiPoint {
  date: string;
  value: number;
  /** 값이 나온 사건 id(해당 사건 카드에서 출처를 본다). */
  eventId?: string;
}

export const KOSPI_MILESTONES: KospiPoint[] = [
  { date: '1999-12-28', value: 1028.07, eventId: '1999-12-28-1' },
  { date: '2007-07-25', value: 2004.22, eventId: '2007-07-25-1' },
  { date: '2008-10-24', value: 938.75, eventId: '2008-10-24-1' },
  { date: '2011-08-08', value: 1869.45, eventId: '2011-08-08-1' },
  { date: '2016-06-24', value: 1925.24, eventId: '2016-06-24-1' },
  { date: '2017-05-04', value: 2241.24, eventId: '2017-05-04-1' },
  { date: '2017-10-30', value: 2501.93, eventId: '2017-10-30-1' },
  { date: '2020-03-19', value: 1457.64, eventId: '2020-03-19-1' },
  { date: '2021-01-06', value: 2968.21, eventId: '2021-01-06-1' },
  // 비상계엄은 12월 3일 밤에 선포되어 증시 반응(종가 2464.00)은 다음 날이다.
  { date: '2024-12-04', value: 2464.0, eventId: '2024-12-03-1' },
  { date: '2025-10-27', value: 4042.83, eventId: '2025-10-27-1' },
  { date: '2026-01-27', value: 5084.85, eventId: '2026-01-27-1' },
  { date: '2026-03-04', value: 5093.54, eventId: '2026-03-04-1' },
  { date: '2026-06-08', value: 7484.41, eventId: '2026-06-08-1' },
];

export const KOSPI_GUIDES = [1000, 2000, 3000, 5000, 7000];
const MIN = 700;
const MAX = 8000;

/** 로그 눈금: 0(맨 아래)~1(맨 위). */
export function kospiRatio(value: number): number {
  return (Math.log(value) - Math.log(MIN)) / (Math.log(MAX) - Math.log(MIN));
}

export function kospiOn(eventId: string): KospiPoint | undefined {
  return KOSPI_MILESTONES.find((p) => p.eventId === eventId);
}
