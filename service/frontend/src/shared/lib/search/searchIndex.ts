// AI LENS 일반 검색 — 순수 로직(검색·점수·강조·키워드)은 @ailens/domain 으로 옮겼다(앱과 공용).
// 이 파일은 기존 import 경로를 지키는 재수출 + 웹 전용 목록 로더(fetch '/api/search-index')만 가진다.
import type { SearchRecord } from '@ailens/domain';

export {
  DEFAULT_PARAMS,
  MAX_QUERY_LENGTH,
  UNCATEGORIZED,
  countByCategory,
  countBySub,
  parseTerms,
  search,
  splitHighlight,
  topKeywords,
} from '@ailens/domain';
export type { SearchHit, SearchParams, SearchPeriod, SearchRecord, SearchScope, SearchSort } from '@ailens/domain';

let memo: Promise<SearchRecord[]> | null = null;

/** 검색용 목록. 한 세션에 한 번만 받는다(실패하면 다음에 다시 시도). */
export function loadSearchIndex(): Promise<SearchRecord[]> {
  if (!memo) {
    memo = fetch('/api/search-index')
      .then((r) => {
        if (!r.ok) throw new Error(`search-index ${r.status}`);
        return r.json() as Promise<{ items: SearchRecord[] }>;
      })
      .then((j) => j.items)
      .catch((e) => {
        memo = null;
        throw e;
      });
  }
  return memo;
}

/** 검색 버튼에 손이 가는 순간(호버·포커스·터치) 목록을 미리 받아 둔다. 실패해도 조용히 넘어가고, 열렸을 때 다시 시도한다. */
export function prefetchSearchIndex(): void {
  void loadSearchIndex().catch((e) => {
    // 미리 받기 실패는 화면에 영향이 없다(열릴 때 다시 시도). 원인만 콘솔에 남긴다.
    console.warn('[search] 목록 미리 받기 실패', e);
  });
}
