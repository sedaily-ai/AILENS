'use client';

import { useEffect, useState } from 'react';
import { fetchLetterDetail, fetchLetterListResult, type IssueLetter } from '@/features/letter';

/** 최신 목록 밖의 저장·읽음 레터도 기존 상세 API로 복원한다. 요청은 한 번에 4개로 제한한다. */
export function useDashboardLetters(slugs: string[], recordsReady: boolean) {
  const [state, setState] = useState<{ letters: IssueLetter[]; loading: boolean; available: boolean; missing: number }>({ letters: [], loading: true, available: true, missing: 0 });
  const [revision, setRevision] = useState(0);
  const key = [...new Set(slugs)].sort().join('\n');
  useEffect(() => {
    if (!recordsReady) return;
    let active = true;
    void (async () => {
      const result = await fetchLetterListResult();
      const letters = [...result.letters];
      const existing = new Set(letters.map((letter) => letter.slug));
      const absent = key ? key.split('\n').filter((slug) => !existing.has(slug)) : [];
      let missing = 0;
      for (let i = 0; i < absent.length && active; i += 4) {
        const details = await Promise.all(absent.slice(i, i + 4).map(fetchLetterDetail));
        for (const letter of details) { if (letter) letters.push(letter); else missing++; }
      }
      if (active) setState({ letters, loading: false, available: result.available, missing });
    })();
    return () => { active = false; };
  }, [key, recordsReady, revision]);
  return { ...state, retry: () => setRevision((value) => value + 1) };
}
