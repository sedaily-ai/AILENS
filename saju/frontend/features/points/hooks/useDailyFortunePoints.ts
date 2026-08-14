'use client';

import { useEffect, useState } from 'react';
import { claimTodayIfNeeded } from '../lib/points';

interface ClaimResult { amount: number; dayCount: number; }

/** 페이지 마운트 시 오늘 처음이면 포인트를 적립하고, 팝업에 필요한 결과를 돌려준다 */
export function useDailyFortunePoints() {
  const [result, setResult] = useState<ClaimResult | null>(null);

  useEffect(() => {
    const r = claimTodayIfNeeded();
    if (r.claimed) setResult({ amount: r.amount, dayCount: r.dayCount });
  }, []);

  return { result, dismiss: () => setResult(null) };
}
