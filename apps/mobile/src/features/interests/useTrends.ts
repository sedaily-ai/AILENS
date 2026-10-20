import { useEffect, useState } from 'react';
import { loadSearchIndex } from '../search/searchData';
import { slugOfCategory, topicGroups } from './dictionary';
import type { Interest, RecLike } from './match';
import { rankTrends, type Trend } from './trend';

/** 검색 목록(/api/search-index)과 화두 사전으로 "요즘 많이 나오는 이야기" 순위를 만든다. 한 번만 받고 화면이 열릴 때마다 다시 계산한다. */
export function useRisingTopics(limit = 5): { trends: Trend[]; loading: boolean } {
  const [state, setState] = useState<{ trends: Trend[]; loading: boolean }>({ trends: [], loading: true });
  useEffect(() => {
    let alive = true;
    void Promise.all([loadSearchIndex(), topicGroups()])
      .then(([recs, groups]) => {
        if (!alive) return;
        const cands: Interest[] = groups.flatMap((g) => g.items.filter((i) => i.type === 'topic'));
        setState({ trends: rankTrends(cands, recs as unknown as RecLike[], (c) => slugOfCategory(c), limit), loading: false });
      })
      .catch(() => alive && setState({ trends: [], loading: false }));
    return () => {
      alive = false;
    };
  }, [limit]);
  return state;
}
