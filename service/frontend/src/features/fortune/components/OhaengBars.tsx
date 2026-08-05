'use client';

import { useEffect, useRef, useState } from 'react';

export type OhaengKey = '목' | '화' | '토' | '금' | '수';

interface Props {
  counts: Record<OhaengKey, number>;
  showLabels?: boolean;       // 막대 옆 라벨 표시 (default true)
  showCounts?: boolean;       // 우측 카운트 표시 (default true)
  compact?: boolean;          // 작은 버전 (간격 줄임)
}

const PALETTE: Record<OhaengKey, { bar: string; text: string }> = {
  목: { bar: '#22c55e', text: '#15803d' },
  화: { bar: '#ef4444', text: '#b91c1c' },
  토: { bar: '#f59e0b', text: '#b45309' },
  금: { bar: '#94a3b8', text: '#475569' },
  수: { bar: '#3b82f6', text: '#1d4ed8' },
};

const KEYS: OhaengKey[] = ['목', '화', '토', '금', '수'];

export function OhaengBars({ counts, showLabels = true, showCounts = true, compact = false }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);
  const max = Math.max(...Object.values(counts), 1);

  useEffect(() => {
    if (!ref.current) return;
    const obs = new IntersectionObserver(
      ([entry]) => entry.isIntersecting && setVisible(true),
      { threshold: 0.2 }
    );
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, []);

  return (
    <div ref={ref} className={compact ? 'space-y-1' : 'space-y-1.5'}>
      {KEYS.map((k) => {
        const v = counts[k] ?? 0;
        const pct = Math.min(100, (v / max) * 100);
        const c = PALETTE[k];
        return (
          <div key={k} className="flex items-center gap-2">
            {showLabels && (
              <span
                className={`text-[12px] font-bold tabular-nums ${compact ? 'w-4' : 'w-5'} text-center`}
                style={{ color: c.text }}
              >
                {k}
              </span>
            )}
            <div className={`flex-1 ${compact ? 'h-1.5' : 'h-2'} bg-gray-100 rounded-full overflow-hidden`}>
              <div
                className="h-full rounded-full"
                style={{
                  width: visible ? `${pct}%` : '0%',
                  background: c.bar,
                  transition: 'width 0.8s cubic-bezier(0.22, 1, 0.36, 1)',
                }}
              />
            </div>
            {showCounts && (
              <span className="w-7 text-right text-[11px] text-gray-400 tabular-nums">
                {v.toFixed(1)}
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
