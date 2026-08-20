import React from 'react';
import { interpolate } from 'remotion';
import { CutLayout } from '../components/CutLayout';
import { Icon } from '../components/Icon';
import { DiagramCutType } from '../lib/schema';
import { COLORS, FONT_FAMILY, FONT_WEIGHT } from '../styles/tokens';
import { useScale } from '../lib/layout';
import { DIAGRAM_STAGGER_SECONDS, useDelayedProgress, useFrames } from '../lib/animation';

// connector variant → 아이콘 키 매핑. variant가 늘어나면 여기만 추가.
const CONNECTOR_ICON: Record<string, string> = {
  arrow: 'arrow-right',
};

const DiagramNode: React.FC<{
  item: Extract<DiagramCutType['data']['nodes'][number], { kind: 'node' }>;
  delayFrames: number;
  scale: number;
}> = ({ item, delayFrames, scale }) => {
  const progress = useDelayedProgress(delayFrames, useFrames(0.4));
  const translateY = interpolate(progress, [0, 1], [16, 0]);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 16 * scale,
        minWidth: 200 * scale,
        opacity: progress,
        transform: `translateY(${translateY}px)`,
      }}
    >
      <div
        style={{
          width: 140 * scale,
          height: 140 * scale,
          borderRadius: 24 * scale,
          background: COLORS.backgroundLight,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name={item.icon} size={68 * scale} color={COLORS.text} strokeWidth={1.6} />
      </div>
      <div
        style={{
          fontFamily: FONT_FAMILY,
          fontWeight: FONT_WEIGHT.semibold,
          fontSize: 30 * scale,
          color: COLORS.text,
          textAlign: 'center',
        }}
      >
        {item.label}
      </div>
    </div>
  );
};

const DiagramConnector: React.FC<{
  item: Extract<DiagramCutType['data']['nodes'][number], { kind: 'connector' }>;
  delayFrames: number;
  scale: number;
}> = ({ item, delayFrames, scale }) => {
  // 화살표는 왼쪽을 기준으로 scaleX(0→1)로 자라나 "그려지는" 느낌을 낸다.
  const progress = useDelayedProgress(delayFrames, useFrames(0.35));

  return (
    <div style={{ opacity: progress, transform: `scaleX(${progress})`, transformOrigin: 'left' }}>
      <Icon
        name={CONNECTOR_ICON[item.variant] ?? 'arrow-right'}
        size={44 * scale}
        color={COLORS.muted}
        strokeWidth={2}
      />
    </div>
  );
};

export const DiagramCut: React.FC<{ cut: DiagramCutType; brand: string }> = ({ cut, brand }) => {
  const scale = useScale();
  const { nodes } = cut.data;
  const staggerFrames = useFrames(DIAGRAM_STAGGER_SECONDS);

  return (
    <CutLayout brand={brand} caption={cut.caption}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 20 * scale,
          width: '100%',
          flexWrap: 'wrap',
        }}
      >
        {nodes.map((item, i) => {
          const delayFrames = i * staggerFrames;
          if (item.kind === 'connector') {
            return (
              <DiagramConnector key={i} item={item} delayFrames={delayFrames} scale={scale} />
            );
          }
          return <DiagramNode key={i} item={item} delayFrames={delayFrames} scale={scale} />;
        })}
      </div>
    </CutLayout>
  );
};
