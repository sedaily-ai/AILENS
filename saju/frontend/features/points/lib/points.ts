/**
 * 출석 포인트 목업 — localStorage 기반. 실제 적립/사용 백엔드 없이
 * "운세 콘텐츠를 보면 그날 처음 한 번 포인트를 받는다" 구조만 시뮬레이션한다.
 */

export interface ClaimRecord { date: string; amount: number; }
interface PointsState { total: number; claims: ClaimRecord[]; }

const STORAGE_KEY = 'saju_points';

/** 월=0 ... 일=6, 점신 참고 — 평일 +2 / 주말 +4 */
const DAY_POINTS = [2, 2, 2, 2, 2, 4, 4];
const DAY_LABELS = ['월', '화', '수', '목', '금', '토', '일'];

function load(): PointsState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { total: 0, claims: [] };
    return JSON.parse(raw);
  } catch {
    return { total: 0, claims: [] };
  }
}

function save(state: PointsState) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function todayStr(): string {
  return toDateStr(new Date());
}

/** JS getDay()(일=0) → 월요일 시작 인덱스(월=0) */
function mondayIndex(jsDay: number): number {
  return (jsDay + 6) % 7;
}

export function getTotalPoints(): number {
  return load().total;
}

export function hasClaimedToday(): boolean {
  return load().claims.some(c => c.date === todayStr());
}

/** 오늘 처음 호출될 때만 적립. 이미 받았으면 claimed:false */
export function claimTodayIfNeeded(): { claimed: boolean; amount: number; total: number; dayCount: number } {
  const state = load();
  const today = todayStr();
  if (state.claims.some(c => c.date === today)) {
    return { claimed: false, amount: 0, total: state.total, dayCount: state.claims.length };
  }
  const amount = DAY_POINTS[mondayIndex(new Date().getDay())];
  const claims = [...state.claims, { date: today, amount }];
  const next: PointsState = { total: state.total + amount, claims };
  save(next);
  return { claimed: true, amount, total: next.total, dayCount: claims.length };
}

export interface WeekDayStatus {
  label: string;
  amount: number;
  claimed: boolean;
  isToday: boolean;
  isFuture: boolean;
}

/** 이번 주(월~일) 출석 현황 */
export function getWeekStatus(): WeekDayStatus[] {
  const state = load();
  const claimed = new Set(state.claims.map(c => c.date));
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - mondayIndex(now.getDay()));
  const today = todayStr();

  return DAY_LABELS.map((label, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const dateStr = toDateStr(d);
    return {
      label,
      amount: DAY_POINTS[i],
      claimed: claimed.has(dateStr),
      isToday: dateStr === today,
      isFuture: dateStr > today,
    };
  });
}
