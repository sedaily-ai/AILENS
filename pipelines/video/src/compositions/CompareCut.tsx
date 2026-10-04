import React from 'react';
import { interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { CutLayout } from '../components/CutLayout';
import { CompareCutType } from '../lib/schema';
import { COLORS, FONT_FAMILY, FONT_WEIGHT } from '../styles/tokens';
import { useIsVertical, useScale } from '../lib/layout';
import { SPRING_EMPHASIS, SPRING_ENTRANCE } from '../lib/animation';

// 전후 비교(프롬프트 §6): 기준값이 먼저 나타난다 → 결과를 말할 때 기준값이 흐려지며 줄이 그어지고 작아진다 → 새 값이 커지며 등장하고 옆에 방향 표시(▲ 빨강 / ▼ 파랑).
// 방향은 두 값의 크기로 정한다. 값·단위는 각본 그대로 쓰고, 차이·증감률 같은 계산값은 화면에 넣지 않는다(프롬프트 §6·§11).
const fmt = (v: number) => v.toLocaleString('ko-KR');

export const CompareCut: React.FC<{ cut: CompareCutType; brand: string }> = ({ cut, brand }) => {
  const scale = useScale();
  const vertical = useIsVertical();
  const k = vertical ? 1 : 0.72;
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { before, after, sourceNote } = cut.data;
  const up = after.value >= before.value;
  const dirColor = up ? COLORS.up : COLORS.down;

  const beforeIn = spring({ frame, fps, config: SPRING_ENTRANCE });
  const t2 = Math.round(1.1 * fps); // 결과를 말하는 시점
  const demote = spring({ frame: frame - t2, fps, config: { damping: 18, stiffness: 70 } });
  const afterIn = spring({ frame: frame - (t2 + Math.round(0.25 * fps)), fps, config: SPRING_EMPHASIS });
  const strike = interpolate(frame - t2, [0, 10], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });

  const beforeScale = interpolate(demote, [0, 1], [1, 0.46]);
  const beforeOpacity = interpolate(demote, [0, 1], [1, 0.5]) * Math.min(1, beforeIn);

  return (
    <CutLayout brand={brand} caption={cut.caption} sourceNote={sourceNote}>
      {/* 기준값 */}
      <div style={{ opacity: beforeOpacity, transform: `translateY(${(1 - Math.min(1, beforeIn)) * 30 * scale}px) scale(${beforeScale})`, transformOrigin: vertical ? 'left top' : 'center top', height: 250 * scale * k * (0.46 + 0.54 * (1 - demote)) }}>
        <div style={{ fontFamily: FONT_FAMILY, fontWeight: FONT_WEIGHT.semibold, fontSize: 44 * scale, color: COLORS.muted }}>{before.label}</div>
        <div style={{ position: 'relative', display: 'inline-flex', alignItems: 'baseline', gap: 14 * scale }}>
          <span style={{ fontFamily: FONT_FAMILY, fontWeight: 900, fontSize: 190 * scale * k, letterSpacing: -4, color: COLORS.text, lineHeight: 1.05, fontVariantNumeric: 'tabular-nums' }}>{fmt(before.value)}</span>
          <span style={{ fontFamily: FONT_FAMILY, fontWeight: FONT_WEIGHT.bold, fontSize: 64 * scale * k, color: COLORS.text }}>{before.unit ?? ''}</span>
          {/* 줄 긋기 */}
          <span style={{ position: 'absolute', left: 0, top: '58%', height: 8 * scale, width: `${strike * 100}%`, background: COLORS.muted, borderRadius: 4 }} />
        </div>
      </div>

      {/* 결과값 */}
      <div style={{ opacity: Math.min(1, Math.max(0, afterIn)), transform: `scale(${0.7 + 0.3 * Math.min(1.08, Math.max(0, afterIn))})`, transformOrigin: vertical ? 'left top' : 'center top' }}>
        <div style={{ fontFamily: FONT_FAMILY, fontWeight: FONT_WEIGHT.semibold, fontSize: 48 * scale, color: COLORS.muted }}>{after.label}</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 24 * scale }}>
          <span style={{ fontFamily: FONT_FAMILY, fontWeight: 900, fontSize: 270 * scale * k, letterSpacing: -6, color: COLORS.accent, lineHeight: 1.05, fontVariantNumeric: 'tabular-nums' }}>{fmt(after.value)}</span>
          <span style={{ fontFamily: FONT_FAMILY, fontWeight: FONT_WEIGHT.bold, fontSize: 80 * scale * k, color: COLORS.text }}>{after.unit ?? ''}</span>
          <svg width={78 * scale * k} height={78 * scale * k} viewBox="0 0 24 24" style={{ flex: 'none' }}>
            <path d={up ? 'M12 4 L22 20 H2 Z' : 'M12 20 L22 4 H2 Z'} fill={dirColor} />
          </svg>
        </div>
      </div>
    </CutLayout>
  );
};
