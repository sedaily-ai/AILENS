import React from 'react';
import { interpolate, useVideoConfig } from 'remotion';
import { CutLayout } from '../components/CutLayout';
import { Icon } from '../components/Icon';
import { DiagramCutType } from '../lib/schema';
import { COLORS, FONT_FAMILY, FONT_WEIGHT } from '../styles/tokens';
import { useScale } from '../lib/layout';
import { DIAGRAM_STAGGER_SECONDS, useDelayedProgress, useFrames } from '../lib/animation';

const NODE_TILE = 168;

// 흐름도(프롬프트 §6) — 아이콘 + 라벨 묶음이 차례로 나타나고 화살표(선)가 그려지듯 뻗는다. 세로 화면은 위에서 아래로 쌓는다.
// 테두리 없는 부드러운 아이콘 타일(한 단계 밝은 네이비 면) + 얇은 연결선. 장식 요소를 쓰지 않는다.
const DiagramNode: React.FC<{
  item: Extract<DiagramCutType['data']['nodes'][number], { kind: 'node' }>;
  delayFrames: number;
  scale: number;
  vertical: boolean;
}> = ({ item, delayFrames, scale, vertical }) => {
  const progress = useDelayedProgress(delayFrames, useFrames(0.45));
  const translateY = interpolate(progress, [0, 1], [28 * scale, 0]);
  const tile = NODE_TILE * scale;

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: vertical ? 'row' : 'column',
        alignItems: 'center',
        gap: (vertical ? 44 : 20) * scale,
        opacity: progress,
        transform: `translateY(${translateY}px)`,
      }}
    >
      <div
        style={{
          width: tile,
          height: tile,
          flex: 'none',
          borderRadius: tile * 0.28,
          background: 'linear-gradient(160deg, #26385F 0%, #1B2A48 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Icon name={item.icon} size={tile * 0.46} color={COLORS.accent} strokeWidth={1.8} />
      </div>
      <div
        style={{
          fontFamily: FONT_FAMILY,
          fontWeight: FONT_WEIGHT.extrabold,
          fontSize: 60 * scale,
          letterSpacing: -0.8,
          color: COLORS.text,
          wordBreak: 'keep-all',
          textAlign: vertical ? 'left' : 'center',
        }}
      >
        {item.label}
      </div>
    </div>
  );
};

const DiagramConnector: React.FC<{
  delayFrames: number;
  scale: number;
  vertical: boolean;
}> = ({ delayFrames, scale, vertical }) => {
  const progress = useDelayedProgress(delayFrames, useFrames(0.35));
  const len = (vertical ? 64 : 80) * scale;
  const tile = NODE_TILE * scale;
  // 세로: 타일 가운데 아래로 뻗는 선(위에서 아래로 그려진다) + 끝의 작은 화살촉. 가로: 오른쪽으로.
  return vertical ? (
    <div style={{ width: tile, height: len, display: 'flex', justifyContent: 'center', flex: 'none' }}>
      <svg width={20 * scale} height={len} viewBox="0 0 20 64" style={{ overflow: 'visible' }}>
        <path d="M10 0 V52" stroke={COLORS.muted} strokeWidth={3} strokeLinecap="round" pathLength={1} strokeDasharray={1} strokeDashoffset={1 - progress} fill="none" />
        <path d="M3 46 L10 54 L17 46" stroke={COLORS.muted} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" fill="none" opacity={progress} />
      </svg>
    </div>
  ) : (
    <div style={{ opacity: progress, transform: `scaleX(${progress})`, transformOrigin: 'left', width: len }}>
      <Icon name="arrow-right" size={44 * scale} color={COLORS.muted} strokeWidth={2} />
    </div>
  );
};

export const DiagramCut: React.FC<{ cut: DiagramCutType; brand: string }> = ({ cut, brand }) => {
  const scale = useScale();
  const { nodes } = cut.data;
  const staggerFrames = useFrames(DIAGRAM_STAGGER_SECONDS);
  const { width, height } = useVideoConfig();
  const vertical = height > width;

  return (
    <CutLayout brand={brand} caption={cut.caption}>
      <div
        style={{
          display: 'flex',
          flexDirection: vertical ? 'column' : 'row',
          alignItems: vertical ? 'flex-start' : 'center',
          justifyContent: vertical ? 'flex-start' : 'center',
          gap: vertical ? 4 * scale : 36 * scale,
          width: '100%',
        }}
      >
        {nodes.map((item, i) => {
          const delayFrames = i * staggerFrames;
          if (item.kind === 'connector') {
            return <DiagramConnector key={i} delayFrames={delayFrames} scale={scale} vertical={vertical} />;
          }
          return <DiagramNode key={i} item={item} delayFrames={delayFrames} scale={scale} vertical={vertical} />;
        })}
      </div>
    </CutLayout>
  );
};
