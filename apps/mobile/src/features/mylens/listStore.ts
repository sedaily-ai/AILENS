import { useCallback, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

// 이 기기에만 저장하는 목록(저장한 글·읽은 글). 웹 나의 LENS 의 레터 저장·읽기 기록도 브라우저 범위이며 서버 계정 동기화는 백엔드 연동 후(P1) 단계다.
// 저장소 접근 실패는 화면에 영향이 없도록 삼킨다. 같은 id 는 맨 앞으로 옮겨 중복을 없앤다.
export interface ListStore<T extends { id: string }> {
  get(): Promise<T[]>;
  add(item: T): Promise<void>;
  remove(id: string): Promise<void>;
  has(id: string): Promise<boolean>;
  subscribe(fn: () => void): () => void;
}

export function createListStore<T extends { id: string }>(key: string, max: number): ListStore<T> {
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());
  const read = async (): Promise<T[]> => {
    try {
      const raw = await AsyncStorage.getItem(key);
      const list = raw ? (JSON.parse(raw) as unknown) : [];
      return Array.isArray(list) ? (list as T[]) : [];
    } catch {
      return [];
    }
  };
  const write = async (list: T[]) => {
    try {
      await AsyncStorage.setItem(key, JSON.stringify(list.slice(0, max)));
    } catch {
      // 저장이 막혀도 앱은 계속 동작한다.
    }
    emit();
  };
  return {
    get: read,
    add: async (item) => write([item, ...(await read()).filter((x) => x.id !== item.id)]),
    remove: async (id) => write((await read()).filter((x) => x.id !== id)),
    has: async (id) => (await read()).some((x) => x.id === id),
    subscribe: (fn) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
  };
}

/** 목록을 읽어 상태로 들고, 저장소가 바뀌면 다시 읽는다. */
export function useListStore<T extends { id: string }>(store: ListStore<T>) {
  const [items, setItems] = useState<T[]>([]);
  const [loaded, setLoaded] = useState(false);
  const reload = useCallback(() => {
    void store.get().then((l) => {
      setItems(l);
      setLoaded(true);
    });
  }, [store]);
  useEffect(() => {
    reload();
    return store.subscribe(reload);
  }, [store, reload]);
  return { items, loaded };
}
