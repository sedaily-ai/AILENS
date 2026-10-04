import React from 'react';
import { spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { CutLayout } from '../components/CutLayout';
import { RankCutType } from '../lib/schema';
import { COLORS, FONT_FAMILY, FONT_WEIGHT } from '../styles/tokens';
import { useIsVertical, useScale } from '../lib/layout';
import { SPRING_ENTRANCE } from '../lib/animation';

// 순위(프롬프트 §6) — 가로 막대가 위에서부터 차례로 뻗는다. 1위만 앰버, 나머지는 한 단계 밝은 네이비 막대.
export const RankCut: React.FC<{ cut: RankCutType; brand: string }> = ({ cut, brand }) => {
  const scale = useScale();
  const vertical = useIsVertical();
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { items, unit, sourceNote } = cut.data;
  const max = Math.max(...items.map((i) => i.value));
  const trackW = (vertical ? 912 : 1240) * scale;

  return (
    <CutLayout brand={brand} caption={cut.caption} sourceNote={sourceNote}>
      <div style={{ width: trackW, display: 'flex', flexDirection: 'column', gap: (vertical ? 44 : 30) * scale }}>
        {items.map((it, i) => {
          const p = Math.min(1, Math.max(0, spring({ frame: frame - i * Math.round(0.25 * fps), fps, config: SPRING_ENTRANCE })));
          const top = it.value === max;
          return (
            <div key={i} style={{ opacity: Math.min(1, p * 1.6) }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 14 * scale, fontFamily: FONT_FAMILY }}>
                <span style={{ fontWeight: FONT_WEIGHT.bold, fontSize: (vertical ? 52 : 44) * scale, color: COLORS.text, wordBreak: 'keep-all' }}>{it.label}</span>
                <span style={{ fontWeight: 900, fontSize: 56 * scale, color: top ? COLORS.accent : COLORS.text, fontVariantNumeric: 'tabular-nums', opacity: p }}>
                  {it.value.toLocaleString('ko-KR')}
                  {unit ?? ''}
                </span>
              </div>
              <div style={{ height: 36 * scale, width: trackW, background: COLORS.backgroundLight, borderRadius: 999 }}>
                <div style={{ height: '100%', width: `${(it.value / max) * p * 100}%`, background: top ? COLORS.accent : '#3C527D', borderRadius: 999 }} />
              </div>
            </div>
          );
        })}
      </div>
    </CutLayout>
  );
};
