'use client';

import { useEffect, useState } from 'react';
import { fetchLensPosts } from '@/shared/lib/api/cmsPostsApi';
import { toLensLetterCard, type TodayLetterCardLike } from '@/shared/lib/api/todayLettersApi';

/**
 * 최신 발행 레터(형) 카드 4편 — 히어로·사이드바·뉴스레터·온보딩 샘플이
 * 공유하는 단일 소스.
 *
 * 2026-09-03(ISR 재설계 감사) — letters 채널 대신 lens(내부 letter 포맷)를
 * 쓴다. letters 채널은 2026-08-12 이후 자동 파이프라인 신규 발행이 없어서
 * (toLensLetterCard 주석 참조) 예전 14일 룩백 로직이 매번 초과돼 이 훅을
 * 쓰는 모든 화면이 조용히 빈 화면을 렌더링해왔다 — lens는 매일 발행되므로
 * 룩백 자체가 불필요해졌다(fetchLensPosts()가 이미 최신순 정렬).
 */
export interface LatestLettersState {
  loading: boolean;
  date: string | null;
  cards: TodayLetterCardLike[];
}

const LATEST_LETTERS_COUNT = 4;

export function useLatestLetters(): LatestLettersState {
  const [state, setState] = useState<LatestLettersState>({
    loading: true,
    date: null,
    cards: [],
  });

  useEffect(() => {
    let cancelled = false;
    fetchLensPosts(LATEST_LETTERS_COUNT)
      .then((posts) => {
        if (cancelled) return;
        const top = posts.slice(0, LATEST_LETTERS_COUNT);
        setState({
          loading: false,
          date: top[0]?.date ?? null,
          cards: top.map(toLensLetterCard),
        });
      })
      .catch(() => {
        if (!cancelled) setState({ loading: false, date: null, cards: [] });
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
