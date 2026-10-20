import type { TimelineEvent } from '@/shared/data/timelineEventTypes';

export type ViewMode = 'personal' | 'year';
export interface BirthdayDate { year: number; month: number; day: number; iso: string }
export interface AnnualPoint { period: string; value: number; unit: string }
export interface MarketSnapshot {
  cpi: AnnualPoint[];
  retrievedAt: string; events: TimelineEvent[];
}
/** 국민연금 개시 시점 하나. start는 지급이 시작되는 달(YYYY-MM), ratio는 정상 수령을 100으로 둔 평생 비율. */
export interface PensionPoint { label: string; age: number; start: string; ratio: number }
export interface PensionCalendar {
  points: PensionPoint[];
  /** 정상 수령과 누적 수령액이 같아지는 나이(만 나이·개월). */
  breakEven: { early: AgeMonths; late: AgeMonths };
}
export interface AgeMonths { years: number; months: number }
/**
 * 생일 이후 겪은 국민적 순간(data/birthdayMoments.ts)과 그때 나이(연도만 공유된 결과면 age는 null, yearsAfter만 쓴다).
 * id는 연대기 사건이면 연대기 사건 id, 아니면 'moment-{날짜}'. link는 줄을 눌렀을 때 갈 곳(연대기의 그 사건 또는 그날 신문, 없으면 null).
 */
export interface AgeEvent {
  id: string; title: string; date: string; age: number | null; yearsAfter: number;
  link: { href: string; label: '연대기에서 보기' | '그날 신문 보기' } | null;
}
export interface BirthdayResult {
  birthDate: string; date: BirthdayDate;
  cpi: number | null; cpiPeriod: string; wage: number | null;
  /** ages는 날짜 순, heroAge는 장면 제목·영수증에 쓰는 대표 순간(ages 중 하나). */
  calendar: PensionCalendar | null; ages: AgeEvent[]; heroAge: AgeEvent | null;
  snapshot: MarketSnapshot;
}
