import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * 오늘의 브리핑 진행 기록(이 기기에만 저장). 하루에 세 단계를 챙기는 구조다.
 *   read   ① 핵심 읽기      — 기사를 열어 읽음
 *   format ② 내 방식으로 보기 — 웹툰·영상을 보거나 오디오를 재생함
 *   save   ③ 남기기         — 글 저장·문장 담기·투표 참여
 * 날짜는 기기의 현지 날짜(YYYY-MM-DD) 기준이다. 90일이 지난 기록은 정리한다.
 */
export type StepKey = 'read' | 'format' | 'save';
export const STEP_KEYS: StepKey[] = ['read', 'format', 'save'];
export type DayRecord = Partial<Record<StepKey, true>>;
type Store = Record<string, DayRecord>;

const KEY = 'ailens:daily-progress';
const KEEP_DAYS = 90;
const listeners = new Set<() => void>();
let cache: Store | null = null;

const pad = (n: number) => String(n).padStart(2, '0');
export function dayKey(d: Date = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

async function load(): Promise<Store> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : {};
    cache = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Store) : {};
  } catch {
    cache = {};
  }
  return cache;
}

async function persist(store: Store) {
  cache = store;
  try {
    // 오래된 날짜는 버린다.
    const limit = dayKey(new Date(Date.now() - KEEP_DAYS * 86400000));
    const trimmed = Object.fromEntries(Object.entries(store).filter(([k]) => k >= limit));
    cache = trimmed;
    await AsyncStorage.setItem(KEY, JSON.stringify(trimmed));
  } catch {
    // 저장이 막혀도 이번 실행에서는 메모리 상태로 동작한다.
  }
  listeners.forEach((l) => l());
}

/** 오늘의 한 단계를 완료로 표시한다. 이미 표시돼 있으면 아무것도 하지 않는다. */
export async function markStep(step: StepKey): Promise<void> {
  const store = await load();
  const today = dayKey();
  if (store[today]?.[step]) return;
  await persist({ ...store, [today]: { ...store[today], [step]: true } });
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

export interface DailyProgress {
  loaded: boolean;
  today: DayRecord;
  doneCount: number;
  streak: number;
  week: WeekDay[];
}

/** 진행 기록을 읽어 상태로 들고, 기록이 바뀌면 다시 읽는다. */
export function useDailyProgress(): DailyProgress {
  const [state, setState] = useState<DailyProgress>({ loaded: false, today: {}, doneCount: 0, streak: 0, week: buildWeek({}) });
  useEffect(() => {
    let alive = true;
    const refresh = () => {
      void load().then((store) => {
        if (!alive) return;
        const today = store[dayKey()] ?? {};
        setState({
          loaded: true,
          today,
          doneCount: STEP_KEYS.filter((k) => today[k]).length,
          streak: computeStreak(store),
          week: buildWeek(store),
        });
      });
    };
    refresh();
    listeners.add(refresh);
    return () => {
      alive = false;
      listeners.delete(refresh);
    };
  }, []);
  return state;
}
