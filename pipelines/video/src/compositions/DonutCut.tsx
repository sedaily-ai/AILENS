import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { CutLayout } from '../components/CutLayout';
import { DonutCutType } from '../lib/schema';
import { COLORS, FONT_FAMILY, FONT_WEIGHT } from '../styles/tokens';
import { useIsVertical, useScale } from '../lib/layout';
import { SPRING_SLOW } from '../lib/animation';

// 도넛(프롬프트 §6) — "전체 중 몇 %". 호가 쓸리듯 채워지고 가운데에 큰 %. 트랙은 한 단계 밝은 네이비.
export const DonutCut: React.FC<{ cut: DonutCutType; brand: string }> = ({ cut, brand }) => {
  const scale = useScale();
  const vertical = useIsVertical();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { value, label, sourceNote } = cut.data;
  const p = Math.min(1, Math.max(0, spring({ frame: frame - 6, fps, config: SPRING_SLOW })));
  const size = (vertical ? 700 : 440) * scale;
  const stroke = (vertical ? 72 : 52) * scale;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const shown = Math.round(value * p);
  const labelIn = interpolate(frame, [10, 24], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  return (
    <CutLayout brand={brand} caption={cut.caption} sourceNote={sourceNote}>
      <div style={{ fontFamily: FONT_FAMILY, fontWeight: FONT_WEIGHT.semibold, fontSize: 46 * scale, color: COLORS.muted, opacity: labelIn, wordBreak: 'keep-all', maxWidth: '90%' }}>{label}</div>
      <div style={{ position: 'relative', width: size, height: size }}>
        <svg width={size} height={size} style={{ transform: 'rotate(-90deg)' }}>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={COLORS.backgroundLight} strokeWidth={stroke} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={COLORS.accent}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={circ * (1 - (value / 100) * p)}
          />
        </svg>
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'baseline', justifyContent: 'center', paddingTop: size * (vertical ? 0.3 : 0.34) }}>
          <span style={{ fontFamily: FONT_FAMILY, fontWeight: 900, fontSize: (vertical ? 250 : 160) * scale, letterSpacing: -5, color: COLORS.text, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}>{shown}</span>
          <span style={{ fontFamily: FONT_FAMILY, fontWeight: FONT_WEIGHT.bold, fontSize: (vertical ? 90 : 60) * scale, color: COLORS.text, marginLeft: 10 * scale }}>%</span>
        </div>
      </div>
    </CutLayout>
  );
};
