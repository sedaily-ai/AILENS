import React from 'react';
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

const Bar: React.FC<{
  barWidth: number;
  barHeight: number;
  delayFrames: number;
  growFrames: number;
  scale: number;
  valueLabel: string;
}> = ({ barWidth, barHeight, delayFrames, growFrames, scale, valueLabel }) => {
  const progress = useDelayedProgress(delayFrames, growFrames);

  return (
    <div
      style={{
        width: barWidth,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'flex-end',
        height: '100%',
        gap: 8 * scale,
      }}
    >
      <span
        style={{
          fontFamily: FONT_FAMILY,
          fontWeight: FONT_WEIGHT.bold,
          fontSize: 22 * scale,
          color: COLORS.text,
          fontVariantNumeric: 'tabular-nums',
          opacity: progress,
        }}
      >
        {valueLabel}
      </span>
      <div
        style={{
          width: '100%',
          height: barHeight,
          background: COLORS.accent,
          borderRadius: `${6 * scale}px ${6 * scale}px 0 0`,
          transform: `scaleY(${progress})`,
          transformOrigin: 'bottom',
        }}
      />
    </div>
  );
};

const BarChart: React.FC<{ cut: ChartCutType; scale: number }> = ({ cut, scale }) => {
  const { points, unit } = cut.data;
  const max = Math.max(...points.map((p) => p.value));
  const width = CHART_WIDTH * scale;
  const height = CHART_HEIGHT * scale;
  const gap = 20 * scale;
  const barWidth = (width - gap * (points.length - 1)) / points.length;
  const staggerFrames = useFrames(CHART_BAR_STAGGER_SECONDS);
  const growFrames = useFrames(BAR_GROW_SECONDS);

  return (
    <div style={{ width, display: 'flex', flexDirection: 'column', gap: 12 * scale }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', height, gap }}>
        {points.map((p, i) => (
          <Bar
            key={i}
            barWidth={barWidth}
            barHeight={Math.max((p.value / max) * height, 4 * scale)}
            delayFrames={i * staggerFrames}
            growFrames={growFrames}
            scale={scale}
            valueLabel={formatValue(p.value, unit)}
          />
        ))}
      </div>
      <div style={{ display: 'flex', gap }}>
        {points.map((p, i) => (
          <div
            key={i}
            style={{
              width: barWidth,
              textAlign: 'center',
              fontFamily: FONT_FAMILY,
              fontWeight: FONT_WEIGHT.medium,
              fontSize: 22 * scale,
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

const LineChart: React.FC<{ cut: ChartCutType; scale: number }> = ({ cut, scale }) => {
  const { points, unit } = cut.data;
  const width = CHART_WIDTH * scale;
  const height = CHART_HEIGHT * scale;
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
                fontSize={22 * scale}
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
              fontSize: 22 * scale,
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
