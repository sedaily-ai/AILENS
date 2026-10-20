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

import { getInterestItems, replaceCategories } from '../interests/store';

/** 관심 분야(카테고리 slug 목록). 새 "내 관심"(분야·섹터·화두) 저장소의 분야 항목만 돌려준다 — 분야만 고르는 옛 화면용. */
export async function getInterests(): Promise<string[]> {
  return (await getInterestItems()).filter((i) => i.type === 'category').map((i) => i.key);
}

export async function setInterests(slugs: string[]): Promise<void> {
  await replaceCategories(slugs);
}

// 이번 주 읽은 글·연속 읽은 날 요약(readingStats)은 2026-10-19 기능 다이어트로 제거했다(웹의 이용 기록·완료 요약 제거와 같은 결정).
// 읽은 글 목록(history)은 '읽은 글' 탭이 그대로 쓴다.
