'use client';

import { useCallback, useEffect, useState } from 'react';

// 계정 동기화는 미구현. 활성화 조건: docs/product/모아쓰기레터/북마크_동기화_연동요구사항.md
export const LETTER_SHELF_NOTICE = {
  browser: '이 브라우저에 저장돼요.',
  sync: '로그인 후 기기 간 동기화는 준비 중이에요.',
} as const;

const SAVED_KEY = 'lens-letter-saved';
const READ_KEY = 'lens-letter-read';

function readList(key: string): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(key) ?? '[]');
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}
function writeList(key: string, list: string[]) {
  try { localStorage.setItem(key, JSON.stringify(list.slice(-200))); } catch { /* 저장 불가 환경은 이번 방문에만 유지 */ }
}

/** 이 기기에 저장한 레터와 읽은 레터(브라우저 저장). 계정 연동은 백엔드 단계에서 같은 모양으로 옮긴다. */
export function useLetterShelf() {
  const [saved, setSaved] = useState<string[]>([]);
  const [read, setRead] = useState<string[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // 마운트 뒤 브라우저 저장값을 읽는다(서버 렌더 결과와 첫 클라이언트 렌더를 같게 두려는 것).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSaved(readList(SAVED_KEY));
    setRead(readList(READ_KEY));
    setReady(true);
  }, []);

  const toggleSaved = useCallback((slug: string) => {
    setSaved((prev) => {
      const next = prev.includes(slug) ? prev.filter((s) => s !== slug) : [...prev, slug];
      writeList(SAVED_KEY, next);
      return next;
    });
  }, []);
  const markRead = useCallback((slug: string) => {
    setRead((prev) => {
      if (prev.includes(slug)) return prev;
      const next = [...prev, slug];
      writeList(READ_KEY, next);
      return next;
    });
  }, []);

  return { ready, saved, read, isSaved: (s: string) => saved.includes(s), isRead: (s: string) => read.includes(s), toggleSaved, markRead };
}
