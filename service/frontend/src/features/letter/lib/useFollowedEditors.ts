'use client';

import { useCallback, useEffect, useState } from 'react';
import { EDITORS, unionInterests } from '../data/editors';
import type { InterestItem } from '../data/interestApi';

const KEY = 'lens-letter-editors';

function readIds(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === 'string' && EDITORS.some((e) => e.id === id)) : [];
  } catch {
    return [];
  }
}

/** 이 기기에서 팔로우한 에디터(목업: 브라우저에 저장). 바꿀 때마다 에디터들의 세부 분야 합집합을 서버의 이 기기 관심으로 보내, 같은 목록에 "왜 맞는지"가 표시되게 한다. */
export function useFollowedEditors(syncInterests: (items: InterestItem[]) => Promise<boolean>) {
  const [ids, setIds] = useState<string[]>([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // 마운트 뒤 브라우저 저장값을 읽는다(서버 렌더 결과와 첫 클라이언트 렌더를 같게 두려는 것).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setIds(readIds());
    setReady(true);
  }, []);

  const toggle = useCallback((id: string) => {
    const next = ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id];
    setIds(next);
    try { localStorage.setItem(KEY, JSON.stringify(next)); } catch { /* 저장 불가 환경이면 이번 방문에만 유지 */ }
    void syncInterests(unionInterests(EDITORS.filter((e) => next.includes(e.id))));
  }, [ids, syncInterests]);

  return { ready, ids, followed: EDITORS.filter((e) => ids.includes(e.id)), isFollowing: (id: string) => ids.includes(id), toggle };
}
