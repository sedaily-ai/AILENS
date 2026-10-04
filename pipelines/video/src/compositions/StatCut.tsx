import React from 'react';
import { CutLayout } from '../components/CutLayout';
import { StatCutType } from '../lib/schema';
import { COLORS, FONT_FAMILY, FONT_WEIGHT } from '../styles/tokens';
import { useScale } from '../lib/layout';
import { useCountUpDecimal, useEnterProgress } from '../lib/animation';
import { interpolate } from 'remotion';

// 큰 수치(프롬프트 §6): 숫자가 0에서 목표값까지 올라가고, 멈추는 순간 살짝 커졌다 돌아온다. 라벨은 0.2초 뒤 아래에서 올라온다.
// 2026-10-03 재디자인 — 왼쪽 정렬, 라벨은 숫자 위 작은 설명, 숫자는 단독으로 크게(수치만 앰버).
export const StatCut: React.FC<{ cut: StatCutType; brand: string }> = ({ cut, brand }) => {
  const scale = useScale();
  const { value, unit, label, sourceNote } = cut.data;
  const displayValue = useCountUpDecimal(value, 0.7);
  const settle = useEnterProgress(0.7); // 카운트가 끝나는 시점에 살짝 튄다
  const pop = interpolate(settle, [0, 0.5, 1], [1, 1.06, 1]);
  const labelIn = useEnterProgress(0.2);

  return (
    <CutLayout brand={brand} caption={cut.caption} sourceNote={sourceNote}>
      <div
        style={{
          fontFamily: FONT_FAMILY,
          fontWeight: FONT_WEIGHT.semibold,
          fontSize: 46 * scale,
          color: COLORS.muted,
          opacity: labelIn,
          transform: `translateY(${(1 - labelIn) * 24 * scale}px)`,
          wordBreak: 'keep-all',
          maxWidth: '92%',
        }}
      >
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 20 * scale, transform: `scale(${pop})`, transformOrigin: 'left center' }}>
        <span
          style={{
            fontFamily: FONT_FAMILY,
            fontWeight: 900,
            fontSize: 280 * scale,
            letterSpacing: -6,
            color: COLORS.accent,
            lineHeight: 1,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {displayValue.toLocaleString('ko-KR')}
        </span>
        <span style={{ fontFamily: FONT_FAMILY, fontWeight: FONT_WEIGHT.bold, fontSize: 84 * scale, color: COLORS.text }}>{unit}</span>
      </div>
    </CutLayout>
  );
};
