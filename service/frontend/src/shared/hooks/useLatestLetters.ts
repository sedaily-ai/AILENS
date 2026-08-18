'use client';

import { useEffect, useState } from 'react';
import {
  fetchTodayLetters,
  toTodayLetterCard,
  type ApiLetter,
  type TodayLetterCardLike,
} from '@/shared/lib/api/todayLettersApi';

/**
 * 최신 발행 레터 4편(라이브 today-letters API).
 *
 * mock 레터 데이터 제거(2026-07-24) 후 히어로·사이드바·뉴스레터·온보딩 샘플이
 * 공유하는 단일 소스. 오늘자가 아직 없으면(editor-pick 발행 전·주말) 직전
 * 발행일까지 최대 14일 거슬러 찾는다. FollowingFeed 의 lookback 과 같은 규칙.
 *
 * fetchTodayLetters 가 날짜별 Promise 캐시를 쓰므로 여러 컴포넌트가 동시에
 * 호출해도 같은 fetch 를 공유한다.
 */
export interface LatestLettersState {
  loading: boolean;
  date: string | null;
  letters: ApiLetter[];
  cards: TodayLetterCardLike[];
}

function todayKST(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
}

function shiftDate(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map((s) => parseInt(s, 10));
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

const MAX_LOOKBACK = 14;

export function useLatestLetters(): LatestLettersState {
  const [state, setState] = useState<LatestLettersState>({
    loading: true,
    date: null,
    letters: [],
    cards: [],
  });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      let d = todayKST();
      for (let i = 0; i <= MAX_LOOKBACK; i += 1) {
        try {
          const res = await fetchTodayLetters(d);
          if (res.letters && res.letters.length > 0) {
            if (!cancelled) {
              setState({
                loading: false,
                date: res.date,
                letters: res.letters,
                cards: res.letters.map((l) => toTodayLetterCard(l, res.date)),
              });
            }
            return;
          }
        } catch {
          /* 이 날짜 실패 → 직전 날짜로 계속 */
        }
        d = shiftDate(d, -1);
      }
      if (!cancelled) setState({ loading: false, date: null, letters: [], cards: [] });
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return state;
}
