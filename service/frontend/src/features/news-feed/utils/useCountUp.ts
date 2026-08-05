'use client';

import { useEffect, useState } from 'react';

/**
 * 숫자가 0 → target까지 부드럽게 올라가는 훅.
 * Reduced motion일 땐 즉시 target 표시.
 */
export function useCountUp(target: number, durationMs = 900, startDelayMs = 200) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || target === 0) {
      setValue(target);
      return;
    }

    let raf = 0;
    let startTime = 0;
    const startId = setTimeout(() => {
      const tick = (ts: number) => {
        if (!startTime) startTime = ts;
        const t = Math.min((ts - startTime) / durationMs, 1);
        // easeOutCubic
        const eased = 1 - Math.pow(1 - t, 3);
        setValue(Math.round(target * eased));
        if (t < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, startDelayMs);

    return () => {
      clearTimeout(startId);
      cancelAnimationFrame(raf);
    };
  }, [target, durationMs, startDelayMs]);

  return value;
}
