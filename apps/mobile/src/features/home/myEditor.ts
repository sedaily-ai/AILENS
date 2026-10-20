import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { EDITORS, findEditor, type LetterEditor } from '@ailens/domain';

/**
 * 내 에디터(이 기기에만 저장). 웹 레터의 에디터 8명 중 한 명을 홈의 "내 에디터"로 둔다.
 * 직접 고르지 않았으면 관심 분야로 기본 에디터를 정한다(아래 INTEREST_EDITOR, 앞에 고른 분야가 우선).
 */
const KEY = 'ailens:my-editor';
/** 분야 → 담당 에디터. 에디터 소개(summary)의 담당 분야를 기준으로 정했다. */
const INTEREST_EDITOR: Record<string, string> = {
  markets: 'mincheol',
  finance: 'junseo',
  economy: 'mincheol',
  industry: 'jihoon',
  politics: 'seoyeon',
  national: 'haeun',
  international: 'yerin',
  property: 'siu',
  culture: 'soyul',
};
const DEFAULT_ID = 'soyul'; // 경제 뉴스가 처음인 분도 이해할 수 있게 풀어 주는 에디터 — 처음 쓰는 사람에게 가장 무난하다.

const listeners = new Set<() => void>();
let chosen: string | null | undefined; // undefined = 아직 읽지 않음, null = 고르지 않음

async function load(): Promise<string | null> {
  if (chosen !== undefined) return chosen;
  try {
    const v = await AsyncStorage.getItem(KEY);
    chosen = v && findEditor(v) ? v : null;
  } catch {
    chosen = null;
  }
  return chosen;
}

export async function chooseEditor(id: string): Promise<void> {
  chosen = id;
  try {
    await AsyncStorage.setItem(KEY, id);
  } catch {
    // 저장이 막혀도 이번 실행에서는 메모리 값으로 동작한다.
  }
  listeners.forEach((l) => l());
}

/** 이 에디터가 맡는 분야(카테고리 slug). 분야→에디터 표의 역방향이다. */
export function categoriesOf(editorId: string): string[] {
  return Object.entries(INTEREST_EDITOR).filter(([, id]) => id === editorId).map(([slug]) => slug);
}

export function defaultEditorFor(interests: string[]): LetterEditor {
  for (const slug of interests) {
    const e = findEditor(INTEREST_EDITOR[slug] ?? '');
    if (e) return e;
  }
  return findEditor(DEFAULT_ID) ?? EDITORS[0];
}

/** 고른 에디터(없으면 관심 분야로 정한 기본 에디터)와 직접 골랐는지 여부. */
export function useMyEditor(interests: string[]): { editor: LetterEditor; picked: boolean } {
  const [id, setId] = useState<string | null | undefined>(chosen);
  useEffect(() => {
    let alive = true;
    const refresh = () => void load().then((v) => alive && setId(v));
    refresh();
    listeners.add(refresh);
    return () => {
      alive = false;
      listeners.delete(refresh);
    };
  }, []);
  const picked = !!id;
  return { editor: (id && findEditor(id)) || defaultEditorFor(interests), picked };
}
