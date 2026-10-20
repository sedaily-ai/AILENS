import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * 오늘의 브리핑 진행 기록(이 기기에만 저장). 하루에 세 단계를 챙기는 구조다.
 *   read   ① 핵심 읽기      — 기사를 열어 읽음
 *   format ② 내 방식으로 보기 — 웹툰·영상을 보거나 오디오를 재생함
 *   save   ③ 남기기         — 글 저장·문장 담기·투표 참여
 * 날짜는 기기의 현지 날짜(YYYY-MM-DD) 기준이다. 90일이 지난 기록은 정리한다.
 */
import { buildWeek, computeStreak, dayKey, STEP_KEYS, type DayRecord, type Store, type StepKey, type WeekDay } from './dailyLogic';
export { STEP_KEYS, dayKey, isActiveDay, isCompleteDay, computeStreak, buildWeek } from './dailyLogic';
export type { DayRecord, StepKey, WeekDay } from './dailyLogic';

const KEY = 'ailens:daily-progress';
const KEEP_DAYS = 90;
const listeners = new Set<() => void>();
let cache: Store | null = null;

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
