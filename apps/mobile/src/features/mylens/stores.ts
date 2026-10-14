import AsyncStorage from '@react-native-async-storage/async-storage';
import { createListStore } from './listStore';

export interface SavedArticle {
  id: string;
  title: string;
  category?: string | null;
  imageUrl?: string | null;
  /** 저장·열람 시각(ms). */
  at: number;
}

/** 저장한 글(북마크). 최대 200건. */
export const bookmarks = createListStore<SavedArticle>('ailens:bookmarks', 200);
/** 읽은 글(열람 기록). 최대 200건, 같은 글을 다시 열면 맨 앞·시각 갱신. */
export const history = createListStore<SavedArticle>('ailens:history', 200);

const INTEREST_KEY = 'ailens:interest-categories';

/** 관심 분야(카테고리 slug 목록). 이 기기에만 저장한다. */
export async function getInterests(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(INTEREST_KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export async function setInterests(slugs: string[]): Promise<void> {
  try {
    await AsyncStorage.setItem(INTEREST_KEY, JSON.stringify(slugs));
  } catch {
    // 저장이 막혀도 이번 실행에서는 화면 상태로 동작한다.
  }
}

const DAY = 24 * 3600 * 1000;
const kstDay = (ms: number) => Math.floor((ms + 9 * 3600 * 1000) / DAY);

/** 읽은 글 기록으로 이번 주(최근 7일) 읽은 글 수와 연속 읽기 일수를 센다. 열람 기준이며 웹의 "70% 읽음" 보상 기준과는 다르다. */
export function readingStats(items: SavedArticle[], now = Date.now()) {
  const today = kstDay(now);
  const days = new Set(items.map((i) => kstDay(i.at)));
  let streak = 0;
  for (let d = days.has(today) ? today : today - 1; days.has(d); d -= 1) streak += 1;
  const week = items.filter((i) => kstDay(i.at) > today - 7).length;
  return { week, streak, total: items.length };
}
