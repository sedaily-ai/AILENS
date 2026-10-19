'use client';

import { useEffect, useState } from 'react';
import { fetchLetterListResult, type IssueLetter } from '@/features/letter';

/** 최신 레터 목록을 불러온다. 저장 레터 내용은 계정 저장 목록이 함께 준다. */
export function useDashboardLetters(ready: boolean) {
  const [state, setState] = useState<{ letters: IssueLetter[]; loading: boolean; available: boolean }>({ letters: [], loading: true, available: true });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    if (!ready) return;
    let active = true;
    void (async () => {
      const result = await fetchLetterListResult();
      if (active) setState({ letters: result.letters, loading: false, available: result.available });
    })();
    return () => { active = false; };
  }, [ready, revision]);
  return { ...state, retry: () => setRevision((value) => value + 1) };
}
