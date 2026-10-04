import React from 'react';
import { useVideoConfig } from 'remotion';
import { interpolate } from 'remotion';
import { CutLayout } from '../components/CutLayout';
import { ChartCutType } from '../lib/schema';
import { COLORS, FONT_FAMILY, FONT_WEIGHT } from '../styles/tokens';
import { useScale } from '../lib/layout';
import {
  CHART_BAR_STAGGER_SECONDS,
  CHART_LINE_DRAW_SECONDS,
  useDelayedProgress,
  useFrames,
} from '../lib/animation';

const CHART_WIDTH = 840;
const CHART_HEIGHT = 280;
const BAR_GROW_SECONDS = 0.5;

const formatValue = (value: number, unit?: string) =>
  `${value.toLocaleString('ko-KR')}${unit ?? ''}`;

// 막대 그래프(프롬프트 §6) — 막대가 아래에서 0.3초 간격으로 자라고, 다 자란 뒤 값 라벨이 붙는다. 핵심 막대 하나만 강조색.
// 2026-10-03 재디자인: 가는 기준선과 옅은 눈금선, 둥근 윗모서리, 한 단계 밝은 네이비 막대(강조 막대만 앰버). 장식 테두리 없음.
const Bar: React.FC<{
  barWidth: number;
  barHeight: number;
  delayFrames: number;
  growFrames: number;
  scale: number;
  valueLabel: string;
  highlight: boolean;
}> = ({ barWidth, barHeight, delayFrames, growFrames, scale, valueLabel, highlight }) => {
  const grow = useDelayedProgress(delayFrames, growFrames);
  const labelIn = useDelayedProgress(delayFrames + growFrames, Math.round(growFrames * 0.6));
  const eased = 1 - Math.pow(1 - grow, 3);

  return (
    <div style={{ width: barWidth, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-end', height: '100%', gap: 14 * scale }}>
      <span
        style={{
          fontFamily: FONT_FAMILY,
          fontWeight: 900,
          fontSize: 52 * scale,
          letterSpacing: -0.5,
          color: highlight ? COLORS.accent : COLORS.text,
          fontVariantNumeric: 'tabular-nums',
          opacity: labelIn,
          transform: `translateY(${(1 - labelIn) * 16 * scale}px)`,
        }}
      >
        {valueLabel}
      </span>
      <div
        style={{
          width: '100%',
          height: barHeight,
          background: highlight ? COLORS.accent : '#3C527D',
          borderRadius: `${18 * scale}px ${18 * scale}px 0 0`,
          transform: `scaleY(${eased})`,
          transformOrigin: 'bottom',
        }}
      />
    </div>
  );
};

const BarChart: React.FC<{ cut: ChartCutType; scale: number }> = ({ cut, scale }) => {
  const { points, unit } = cut.data;
  const max = Math.max(...points.map((p) => p.value));
  const { width: vw, height: vh } = useVideoConfig();
  const width = (vh > vw ? 900 : CHART_WIDTH) * scale;
  const height = CHART_HEIGHT * scale * (vh > vw ? 2.1 : 1.15);
  const gap = 36 * scale;
  const barWidth = Math.min((width - gap * (points.length - 1)) / points.length, 240 * scale);
  const staggerFrames = useFrames(CHART_BAR_STAGGER_SECONDS * 3.75); // 0.3초 간격
  const growFrames = useFrames(BAR_GROW_SECONDS);
  const chartWidth = barWidth * points.length + gap * (points.length - 1);

  return (
    <div style={{ width: chartWidth, display: 'flex', flexDirection: 'column', gap: 18 * scale }}>
      <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-end', height, gap, borderBottom: `${3 * scale}px solid #3A4C70` }}>
        {[0.33, 0.66, 1].map((r) => (
          <div key={r} style={{ position: 'absolute', left: 0, right: 0, bottom: height * r, borderTop: `${2 * scale}px solid #1E2A44` }} />
        ))}
        {points.map((p, i) => (
          <Bar
            key={i}
            barWidth={barWidth}
            barHeight={Math.max((p.value / max) * height * 0.82, 6 * scale)}
            delayFrames={i * staggerFrames}
            growFrames={growFrames}
            scale={scale}
            valueLabel={formatValue(p.value, unit)}
            highlight={p.value === max}
          />
        ))}
      </div>
      <div style={{ display: 'flex', gap }}>
        {points.map((p, i) => (
          <div key={i} style={{ width: barWidth, textAlign: 'center', fontFamily: FONT_FAMILY, fontWeight: FONT_WEIGHT.semibold, fontSize: 38 * scale, color: COLORS.muted, wordBreak: 'keep-all' }}>
            {p.label}
          </div>
        ))}
      </div>
    </div>
  );
};

const LineChart: React.FC<{ cut: ChartCutType; scale: number }> = ({ cut, scale }) => {
  const { points, unit } = cut.data;
  const { width: vw, height: vh } = useVideoConfig();
  const width = CHART_WIDTH * scale;
  const height = CHART_HEIGHT * scale * (vh > vw ? 2 : 1); // 세로 화면은 그래프를 키운다
  const topPad = 40 * scale;
  const plotHeight = height - topPad;
  const drawFrames = useFrames(CHART_LINE_DRAW_SECONDS);
  const drawProgress = useDelayedProgress(0, drawFrames);

  const values = points.map((p) => p.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  const coords = points.map((p, i) => {
    const x = points.length === 1 ? width / 2 : (i / (points.length - 1)) * width;
    const y = topPad + plotHeight - ((p.value - min) / range) * plotHeight;
    return { x, y, value: p.value };
  });

  const path = coords.map((c, i) => `${i === 0 ? 'M' : 'L'} ${c.x} ${c.y}`).join(' ');

  return (
    <div style={{ width, display: 'flex', flexDirection: 'column', gap: 12 * scale }}>
      <svg width={width} height={height} style={{ overflow: 'visible' }}>
        <path
          d={path}
          fill="none"
          stroke={COLORS.accent}
          strokeWidth={4 * scale}
          strokeLinecap="round"
          strokeLinejoin="round"
          pathLength={1}
          strokeDasharray={1}
          strokeDashoffset={1 - drawProgress}
        />
        {coords.map((c, i) => {
          const threshold = points.length === 1 ? 0 : i / (points.length - 1);
          const pointOpacity = interpolate(drawProgress, [threshold - 0.06, threshold + 0.02], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          });
          return (
            <g key={i} opacity={pointOpacity}>
              <circle cx={c.x} cy={c.y} r={7 * scale} fill={COLORS.accent} />
              <text
                x={c.x}
                y={c.y - 16 * scale}
                textAnchor="middle"
                fontFamily={FONT_FAMILY}
                fontWeight={FONT_WEIGHT.bold}
                fontSize={34 * scale}
                fill={COLORS.text}
              >
                {formatValue(c.value, unit)}
              </text>
            </g>
          );
        })}
      </svg>
      <div style={{ display: 'flex' }}>
        {points.map((p, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              textAlign: 'center',
              fontFamily: FONT_FAMILY,
              fontWeight: FONT_WEIGHT.medium,
              fontSize: 34 * scale,
              color: COLORS.muted,
            }}
          >
            {p.label}
          </div>
        ))}
      </div>
    </div>
  );
};

export const ChartCut: React.FC<{ cut: ChartCutType; brand: string }> = ({ cut, brand }) => {
  const scale = useScale();

  return (
    <CutLayout brand={brand} caption={cut.caption} sourceNote={cut.data.sourceNote}>
      {cut.data.chartType === 'bar' ? (
        <BarChart cut={cut} scale={scale} />
      ) : (
        <LineChart cut={cut} scale={scale} />
      )}
    </CutLayout>
  );
};
