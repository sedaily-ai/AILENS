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

// 이번 주 읽은 글·연속 읽은 날 요약(readingStats)은 2026-10-19 기능 다이어트로 제거했다(웹의 이용 기록·완료 요약 제거와 같은 결정).
// 읽은 글 목록(history)은 '읽은 글' 탭이 그대로 쓴다.
