import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { categorySlugsOf, keyOf, type Interest } from './match';

/**
 * 내 관심(이 기기에만 저장). 분야·섹터·화두를 섞어 최대 MAX 개.
 * 이전 버전은 분야 slug 목록만 'ailens:interest-categories' 에 저장했다 — 처음 읽을 때 분야 항목으로 옮긴다(옛 키는 남겨 두어 되돌릴 수 있다).
 */
const KEY = 'ailens:my-interests-v2';
const OLD_KEY = 'ailens:interest-categories';
export const MAX_INTERESTS = 20;

const listeners = new Set<() => void>();
let cache: Interest[] | null = null;
/** ECON_CATEGORIES 의 라벨 조회(옛 slug → 새 항목 변환용). 순환 import 를 피해 주입한다. */
let labelOf: (slug: string) => string | undefined = () => undefined;
export function configureLabels(fn: (slug: string) => string | undefined) {
  labelOf = fn;
}

const valid = (x: unknown): x is Interest =>
  !!x && typeof x === 'object' && ['category', 'sub', 'topic'].includes((x as Interest).type) && typeof (x as Interest).key === 'string' && typeof (x as Interest).label === 'string';

async function load(): Promise<Interest[]> {
  if (cache) return cache;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) {
      const arr = JSON.parse(raw) as unknown;
      cache = Array.isArray(arr) ? arr.filter(valid) : [];
    } else {
      const old = await AsyncStorage.getItem(OLD_KEY);
      const slugs = old ? (JSON.parse(old) as unknown) : [];
      cache = (Array.isArray(slugs) ? slugs : [])
        .filter((s): s is string => typeof s === 'string' && !!labelOf(s))
        .map((s) => ({ type: 'category' as const, key: s, label: labelOf(s) as string }));
      if (cache.length) await AsyncStorage.setItem(KEY, JSON.stringify(cache));
    }
  } catch {
    cache = [];
  }
  return cache;
}

async function save(next: Interest[]) {
  cache = next.slice(0, MAX_INTERESTS);
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(cache));
    // 옛 화면(분야만 고르는 곳)과 호환: 분야 항목은 옛 키에도 같이 기록한다.
    await AsyncStorage.setItem(OLD_KEY, JSON.stringify(cache.filter((i) => i.type === 'category').map((i) => i.key)));
  } catch {
    // 저장이 막혀도 이번 실행에서는 메모리 값으로 동작한다.
  }
  listeners.forEach((l) => l());
}

export async function getInterestItems(): Promise<Interest[]> {
  return load();
}

/** 있으면 빼고 없으면 담는다. 가득 찼으면 false. */
export async function toggleInterest(it: Interest): Promise<boolean> {
  const cur = await load();
  const k = keyOf(it);
  if (cur.some((c) => keyOf(c) === k)) {
    await save(cur.filter((c) => keyOf(c) !== k));
    return true;
  }
  if (cur.length >= MAX_INTERESTS) return false;
  await save([...cur, it]);
  return true;
}

export async function removeInterest(it: Pick<Interest, 'type' | 'key'>): Promise<void> {
  const cur = await load();
  await save(cur.filter((c) => keyOf(c) !== keyOf(it)));
}

/** 분야 항목만 통째로 바꾼다(관심 분야만 고르는 옛 화면용). 섹터·화두는 그대로 둔다. */
export async function replaceCategories(slugs: string[]): Promise<void> {
  const cur = await load();
  const keep = cur.filter((c) => c.type !== 'category');
  const cats = slugs.filter((s) => labelOf(s)).map((s) => ({ type: 'category' as const, key: s, label: labelOf(s) as string }));
  await save([...cats, ...keep]);
}

export function useInterestItems(): { items: Interest[]; slugs: string[]; loaded: boolean } {
  const [state, setState] = useState<{ items: Interest[]; loaded: boolean }>({ items: cache ?? [], loaded: cache !== null });
  useEffect(() => {
    let alive = true;
    const refresh = () => void load().then((items) => alive && setState({ items, loaded: true }));
    refresh();
    listeners.add(refresh);
    return () => {
      alive = false;
      listeners.delete(refresh);
    };
  }, []);
  return { items: state.items, slugs: categorySlugsOf(state.items), loaded: state.loaded };
}
