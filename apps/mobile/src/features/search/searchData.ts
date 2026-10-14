import { getApiConfig } from '@ailens/api-client';
import type { SearchRecord } from '@ailens/domain';

// 검색 대상 목록(제목·요약·분류·날짜·썸네일, 본문 제외). 웹과 같은 /api/search-index 를 쓴다.
// 약 1.4MB(2,684건 기준)라 한 세션에 한 번만 받고 메모리에 둔다. 실패하면 다음 호출에서 다시 시도한다.
// 디스크 캐시(AsyncStorage)·서버 검색은 글이 훨씬 늘 때 도입한다(웹 주석과 같은 기준).
let memo: Promise<SearchRecord[]> | null = null;

export function loadSearchIndex(): Promise<SearchRecord[]> {
  if (!memo) {
    memo = fetch(`${getApiConfig().cmsApiUrl}/api/search-index`)
      .then((r) => {
        if (!r.ok) throw new Error(`목록 요청 실패 (${r.status})`);
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
