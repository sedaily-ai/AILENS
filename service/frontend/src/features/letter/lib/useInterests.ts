'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchBundles, fetchMyFeed, fetchMyInterests, fetchTopics, saveMyInterests, type Bundle, type InterestItem, type TopicOption } from '../data/interestApi';

/** 이 기기의 관심 설정 상태. 서버를 못 읽으면 available=false 라 관심 관련 UI를 통째로 숨기고 목록은 그대로 둔다. */
export function useInterests() {
  const [ready, setReady] = useState(false);
  const [bundles, setBundles] = useState<Bundle[]>([]);
  const [topics, setTopics] = useState<TopicOption[]>([]);
  const [saved, setSaved] = useState<InterestItem[]>([]);
  const [reasons, setReasons] = useState<Record<string, string>>({}); // 레터 slug → "관심 주제 '금리'를 다뤘어요" 같은 사실형 이유

  const loadReasons = useCallback(async (items: InterestItem[]) => {
    if (items.length === 0) return setReasons({});
    const feed = await fetchMyFeed(30);
    setReasons(Object.fromEntries(feed.filter((l) => l.reason).map((l) => [l.slug, l.reason as string])));
  }, []);

  useEffect(() => {
    // 마운트 뒤 서버에서 읽는다(서버 렌더 결과와 첫 클라이언트 렌더를 같게 두려는 것).
    let alive = true;
    void (async () => {
      const [b, t, mine] = await Promise.all([fetchBundles(), fetchTopics(), fetchMyInterests()]);
      if (!alive) return;
      setBundles(b);
      setTopics(t);
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
    await loadReasons(result);
    return true;
  }, [loadReasons]);

  return { ready, available: ready && (bundles.length > 0 || topics.length > 0), bundles, topics, saved, reasons, save };
}

export type InterestState = ReturnType<typeof useInterests>;
