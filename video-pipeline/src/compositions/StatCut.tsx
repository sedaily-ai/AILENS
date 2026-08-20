import React from 'react';
import { CutLayout } from '../components/CutLayout';
import { StatCutType } from '../lib/schema';
import { COLORS, FONT_FAMILY, FONT_WEIGHT } from '../styles/tokens';
import { useScale } from '../lib/layout';
import { useCountUp } from '../lib/animation';

export const StatCut: React.FC<{ cut: StatCutType; brand: string }> = ({ cut, brand }) => {
  const scale = useScale();
  const { value, unit, label, sourceNote } = cut.data;
  const displayValue = useCountUp(value);

  return (
    <CutLayout brand={brand} caption={cut.caption} sourceNote={sourceNote}>
      <div
        style={{
          fontFamily: FONT_FAMILY,
          fontWeight: FONT_WEIGHT.semibold,
          fontSize: 32 * scale,
          color: COLORS.muted,
          textAlign: 'center',
        }}
      >
        {label}
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 * scale }}>
        <span
          style={{
            fontFamily: FONT_FAMILY,
            fontWeight: FONT_WEIGHT.extrabold,
            fontSize: 168 * scale,
            color: COLORS.accent,
            lineHeight: 1,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {displayValue.toLocaleString('ko-KR')}
        </span>
        <span
          style={{
            fontFamily: FONT_FAMILY,
            fontWeight: FONT_WEIGHT.bold,
            fontSize: 56 * scale,
            color: COLORS.text,
          }}
        >
          {unit}
        </span>
      </div>
    </CutLayout>
  );
};
