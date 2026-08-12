import { getFamousBirthdays, type FamousPerson } from '@/shared/data/famousBirthdays';
import { getSnapshotByDate, type EconomicSnapshot } from '@/shared/data/economicSnapshots';
import { fetchTimeMachineData } from '@/shared/api/timeMachineApi';
import { fetchLiveMarket, type LiveMarket } from '@/shared/lib/marketLive';
import type { DayNews, HistoricalEvent } from '@/shared/types/timeMachine';

export type { DayNews, HistoricalEvent, FamousPerson, EconomicSnapshot, LiveMarket };

// 서버(page.tsx)/클라이언트(TimeMachineDayClient.tsx) 양쪽이 같이 쓰는 데이터 계층
// (2026-08-12, SSR 분리 — /timeline의 timelineApi.ts, /words의 words.ts와 같은 이유).
// 예전엔 TimeMachineClient.tsx 안에서 이 네 호출을 useEffect+Promise.all로 클라이언트에서만
// 실행했다 — 크롤러가 보는 첫 페인트엔 아무 결과도 없었다.
export interface TimeMachineDay {
  news: DayNews[];
  events: HistoricalEvent[];
  birthdays: FamousPerson[];
  snapshot: EconomicSnapshot;
  liveMarket: LiveMarket | null;
}

// 1990-01-01 ~ 어제(KST)까지만 유효 — NewsTimeMachine 입력 폼의 min/max 제약과 동일.
export const EARLIEST_DATE = '1990-01-01';

export function isValidTimeMachineDate(dateStr: string, todayIso: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  return dateStr >= EARLIEST_DATE && dateStr < todayIso;
}

export async function fetchTimeMachineDay(date: string): Promise<TimeMachineDay> {
  const [data, liveMarket] = await Promise.all([fetchTimeMachineData(date), fetchLiveMarket()]);
  return {
    news: data.news,
    events: data.historicalEvents,
    birthdays: getFamousBirthdays(date),
    snapshot: getSnapshotByDate(date),
    liveMarket,
  };
}
