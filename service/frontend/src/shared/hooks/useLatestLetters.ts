'use client';

import { useEffect, useState } from 'react';
import { fetchLensPosts } from '@/shared/lib/api/cmsPostsApi';
import { toLensLetterCard, type TodayLetterCardLike } from '@/shared/lib/api/todayLettersApi';

/**
 * 최신 발행 레터(형) 카드 4편. 히어로·사이드바·뉴스레터·온보딩 샘플이 공유하는 단일 소스다.
 *
 * letters 채널 대신 lens(내부 letter 포맷)를 쓴다. letters 채널은 자동 파이프라인 신규 발행이 없어(toLensLetterCard 주석 참조)
 * 날짜 룩백 방식은 빈 화면이 되기 때문이며, lens는 매일 발행되고 fetchLensPosts()가 이미 최신순이라 룩백이 필요 없다.
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
