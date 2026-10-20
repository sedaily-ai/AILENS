import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * 오늘의 브리핑 설정(이 기기에만 저장). 시간(분)과 상황이 "오늘 챙길 N가지"의 개수와 ② 단계의 이동 화면을 정한다.
 * 관심 분야는 따로 저장되는 mylens/stores 의 interests 를 그대로 쓴다.
 */
export type Minutes = 3 | 5 | 10;
export type Situation = 'commute' | 'lunch' | 'evening' | 'weekend';
export interface BriefingPrefs {
  minutes: Minutes;
  situation: Situation | null;
}

export const MINUTES: Minutes[] = [3, 5, 10];
export const PICK_COUNT: Record<Minutes, number> = { 3: 2, 5: 3, 10: 5 };
/** 상황별로 어울리는 형식 화면. 출근길=듣기, 점심=웹툰(짧게), 퇴근 후=읽기(정독), 주말=레터(깊게). */
export const SITUATION_ROUTE: Record<Situation, '/listen' | '/webtoon' | '/letter'> = {
  commute: '/listen',
  lunch: '/webtoon',
  evening: '/letter',
  weekend: '/letter',
};

const KEY = 'ailens:briefing-prefs';
const DEFAULT: BriefingPrefs = { minutes: 5, situation: null };
const listeners = new Set<() => void>();
let cache: BriefingPrefs | null = null;

async function load(): Promise<BriefingPrefs> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const p = raw ? (JSON.parse(raw) as Partial<BriefingPrefs>) : {};
    cache = {
      minutes: MINUTES.includes(p.minutes as Minutes) ? (p.minutes as Minutes) : DEFAULT.minutes,
      situation: p.situation && p.situation in SITUATION_ROUTE ? p.situation : null,
    };
  } catch {
    cache = DEFAULT;
  }
  return cache;
}

export async function saveBriefingPrefs(next: BriefingPrefs): Promise<void> {
  cache = next;
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // 저장이 막혀도 이번 실행에서는 메모리 값으로 동작한다.
  }
  listeners.forEach((l) => l());
}

export function useBriefingPrefs(): BriefingPrefs {
  const [prefs, setPrefs] = useState<BriefingPrefs>(cache ?? DEFAULT);
  useEffect(() => {
    let alive = true;
    const refresh = () => void load().then((p) => alive && setPrefs(p));
    refresh();
    listeners.add(refresh);
    return () => {
      alive = false;
      listeners.delete(refresh);
    };
  }, []);
  return prefs;
}
