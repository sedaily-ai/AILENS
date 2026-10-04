import React from 'react';
import { interpolate, interpolateColors, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { CaptionValue } from '../lib/schema';
import { COLORS, FONT_FAMILY, FONT_WEIGHT } from '../styles/tokens';
import { useIsVertical, useScale } from '../lib/layout';
import { SPRING_EMPHASIS, SPRING_ENTRANCE, SPRING_SLOW } from '../lib/animation';

// 전면 타이포(프롬프트 §6) — 박스 없이 큰 글자가 화면을 채운다. 단어가 하나씩 올라오고, 강조어가 마지막에 앰버로 튀어나온다.
// slow=true면 마무리 장면처럼 더 느린 스프링을 쓴다.
type Word = { text: string; emphasis: boolean };

const toWords = (value: CaptionValue): Word[] => {
  if (typeof value === 'string') return value.split(/\s+/).filter(Boolean).map((t) => ({ text: t, emphasis: false }));
  const out: Word[] = [];
  for (const seg of value) {
    if (seg.emphasis) out.push({ text: seg.text.trim(), emphasis: true });
    else seg.text.split(/\s+/).filter(Boolean).forEach((t) => out.push({ text: t, emphasis: false }));
  }
  return out;
};

export const KineticText: React.FC<{
  value: CaptionValue;
  size?: number; // 1080 기준 px
  slow?: boolean;
  align?: 'left' | 'center';
}> = ({ value, size = 116, slow = false, align: alignProp }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const scale = useScale();
  const align = alignProp ?? (useIsVertical() ? 'left' : 'center');
  const words = toWords(value);
  const step = Math.round((slow ? 0.2 : 0.13) * fps);
  const plain = words.filter((w) => !w.emphasis).length;
  const lastPlainStart = Math.max(plain - 1, 0) * step;

  let plainIndex = 0;
  return (
    <div
      style={{
        fontFamily: FONT_FAMILY,
        fontWeight: FONT_WEIGHT.extrabold,
        fontSize: size * scale,
        lineHeight: 1.22,
        letterSpacing: -1.5,
        color: COLORS.text,
        display: 'flex',
        flexWrap: 'wrap',
        columnGap: 0.26 * size * scale,
        rowGap: 0.04 * size * scale,
        justifyContent: align === 'center' ? 'center' : 'flex-start',
        textAlign: align,
        wordBreak: 'keep-all',
      }}
    >
      {words.map((w, i) => {
        const start = w.emphasis ? lastPlainStart + Math.round(0.28 * fps) + step : plainIndex * step;
        if (!w.emphasis) plainIndex += 1;
        const p = spring({ frame: frame - start, fps, config: w.emphasis ? SPRING_EMPHASIS : slow ? SPRING_SLOW : SPRING_ENTRANCE });
        const op = interpolate(frame - start, [0, 8], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' });
        const y = interpolate(p, [0, 1], [48 * scale, 0]);
        const color = w.emphasis ? interpolateColors(Math.min(1, Math.max(0, p)), [0, 1], [COLORS.text, COLORS.accent]) : COLORS.text;
        const s = w.emphasis ? 0.82 + 0.18 * Math.min(1.12, Math.max(0, p)) : 1; // 줄어든 크기에서 튀며 제자리로(옆 단어와 겹치지 않게)
        return (
          <span
            key={i}
            style={{
              display: 'inline-block',
              opacity: op,
              transform: `translateY(${y}px) scale(${s})`,
              transformOrigin: 'left bottom',
              marginRight: w.emphasis ? 0.05 * size * scale : 0,
              color,
              fontWeight: w.emphasis ? 900 : FONT_WEIGHT.extrabold,
            }}
          >
            {w.text}
          </span>
        );
      })}
    </div>
  );
};
