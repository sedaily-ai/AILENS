import type { TimelineEvent } from '@/shared/data/timelineEventTypes';

export type Sex = 'all' | 'female' | 'male';
export type ViewMode = 'personal' | 'example' | 'year';
export interface BirthdayDate { year: number; month: number; day: number; iso: string }
export interface AnnualPoint { period: string; value: number; unit: string }
export interface MarketSnapshot {
  cpi: AnnualPoint[]; gni: AnnualPoint[]; fx: AnnualPoint[];
  retrievedAt: string; events: TimelineEvent[];
}
export interface MarketItem {
  id: string; group: number; title: string; subtitle: string;
  availability: string; explanation: string; sourceIds: string[]; number: number;
}
export interface MarketRow extends MarketItem {
  state: 'ready' | 'partial' | 'pending' | 'unavailable';
  before: string; after: string; change: string; changeValue: number | null;
  period: string; detail: string;
}
export interface PensionPoint { label: string; age: number; date: string; change: string; changeValue: number }
export interface BirthdayResult {
  birthDate: string; sex: Sex; date: BirthdayDate; rows: MarketRow[];
  cpi: number | null; cpiPeriod: string; purchasingPower: number | null;
  calendar: PensionPoint[] | null; chart: AnnualPoint[];
  events: TimelineEvent[]; snapshot: MarketSnapshot;
}
export interface AnnualComparison {
  id: string; title: string; before: number; after: number;
  change: number; unit: string; period: string;
}
