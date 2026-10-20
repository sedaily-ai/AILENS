// 오늘의 브리핑 진행의 순수 계산(저장소·React 의존 없음). 저장·구독은 dailyProgress.ts 가 맡는다.
export type StepKey = 'read' | 'format' | 'save';
export const STEP_KEYS: StepKey[] = ['read', 'format', 'save'];
export type DayRecord = Partial<Record<StepKey, true>>;
export type Store = Record<string, DayRecord>;


const KEEP_DAYS = 90;
const pad = (n: number) => String(n).padStart(2, '0');
export function dayKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** 한 날의 단계 중 하나라도 챙겼으면 그날은 "챙긴 날"이다. */
export const isActiveDay = (rec?: DayRecord): boolean => !!rec && STEP_KEYS.some((k) => rec[k]);
export const isCompleteDay = (rec?: DayRecord): boolean => !!rec && STEP_KEYS.every((k) => rec[k]);

/** 연속으로 챙긴 날 수. 오늘 아직 아무것도 안 했어도 어제까지 이어진 연속은 끊기지 않는다. */
export function computeStreak(store: Store, now: Date = new Date()): number {
  let streak = 0;
  const cursor = new Date(now);
  for (let i = 0; i < KEEP_DAYS; i++) {
    const active = isActiveDay(store[dayKey(cursor)]);
    if (active) streak++;
    else if (i > 0) break; // 오늘(i=0)은 아직 안 했을 수 있으므로 건너뛴다.
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export interface WeekDay {
  key: string;
  label: string;
  isToday: boolean;
  isFuture: boolean;
  active: boolean;
  complete: boolean;
}

const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

/** 이번 주(월~일) 일곱 날의 상태. */
export function buildWeek(store: Store, now: Date = new Date()): WeekDay[] {
  const todayKey = dayKey(now);
  const monday = new Date(now);
  const offset = (now.getDay() + 6) % 7; // 월요일 기준
  monday.setDate(now.getDate() - offset);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const key = dayKey(d);
    return {
      key,
      label: DAY_LABELS[d.getDay()],
      isToday: key === todayKey,
      isFuture: key > todayKey,
      active: isActiveDay(store[key]),
      complete: isCompleteDay(store[key]),
    };
  });
}

