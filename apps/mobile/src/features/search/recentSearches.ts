import AsyncStorage from '@react-native-async-storage/async-storage';

// 최근 검색어 — 이 기기에만 저장한다(서버로 보내지 않음). 저장소 접근 실패는 화면에 영향이 없도록 삼킨다. 웹 recentSearches.ts 와 같은 규칙(최대 8개).
const KEY = 'ailens:recent-searches';
const MAX = 8;

export async function getRecentSearches(): Promise<string[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(list) ? list.filter((x): x is string => typeof x === 'string').slice(0, MAX) : [];
  } catch {
    return [];
  }
}

async function save(list: string[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    // 저장이 막혀도 검색은 동작한다.
  }
}

export async function addRecentSearch(q: string): Promise<string[]> {
  const term = q.trim();
  if (!term) return getRecentSearches();
  const next = [term, ...(await getRecentSearches()).filter((x) => x !== term)].slice(0, MAX);
  await save(next);
  return next;
}

export async function removeRecentSearch(q: string): Promise<string[]> {
  const next = (await getRecentSearches()).filter((x) => x !== q);
  await save(next);
  return next;
}

export async function clearRecentSearches(): Promise<void> {
  await save([]);
}
