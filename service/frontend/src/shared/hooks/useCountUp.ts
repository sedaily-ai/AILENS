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
      // matchMedia는 브라우저 전용이라 렌더 중(SSR)엔 못 읽는다 — 이 분기
      // 자체가 마운트 후에만 판단 가능해 effect가 맞는 자리(2026-08-23,
      // set-state-in-effect 확인).
      // eslint-disable-next-line react-hooks/set-state-in-effect
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
