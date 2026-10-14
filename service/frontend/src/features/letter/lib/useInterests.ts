'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchMyFeed, fetchMyInterests, saveMyInterests, type InterestItem } from '../data/interestApi';
import type { IssueLetter } from '../data/letterTypes';

/** 이 기기의 관심(서버 저장)과 레터별 "왜 맞는지" 문구. 서버를 못 읽으면 available=false 라 표시만 생략하고 목록은 그대로 둔다. */
export function useInterests() {
  const [ready, setReady] = useState(false);
  const [available, setAvailable] = useState(false);
  const [saved, setSaved] = useState<InterestItem[]>([]);
  const [reasons, setReasons] = useState<Record<string, string>>({}); // 레터 slug → "관심 주제 '금리'를 다뤘어요" 같은 사실형 이유
  const [matchedLetters, setMatchedLetters] = useState<IssueLetter[]>([]);

  const loadReasons = useCallback(async (items: InterestItem[]) => {
    if (items.length === 0) { setReasons({}); setMatchedLetters([]); return; }
    const feed = await fetchMyFeed(30);
    setMatchedLetters(feed);
    setReasons(Object.fromEntries(feed.filter((l) => l.reason).map((l) => [l.slug, l.reason as string])));
  }, []);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const mine = await fetchMyInterests();
      if (!alive) return;
      setAvailable(mine !== null);
      setSaved(mine ?? []);
      await loadReasons(mine ?? []);
      if (alive) setReady(true);
    })();
    return () => { alive = false; };
  }, [loadReasons]);

  const save = useCallback(async (items: InterestItem[]): Promise<boolean> => {
    const result = await saveMyInterests(items);
    if (!result) return false;
    setSaved(result);
    setAvailable(true);
    await loadReasons(result);
    return true;
  }, [loadReasons]);

  return { ready, available, saved, reasons, matchedLetters, save };
}

export type InterestState = ReturnType<typeof useInterests>;
