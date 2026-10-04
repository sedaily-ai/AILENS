import React from 'react';
import { useCurrentFrame, useVideoConfig } from 'remotion';
import { COLORS } from '../styles/tokens';

// 딥네이비 배경(2026-10-03, 프롬프트 §7): 아주 느린 그라데이션(한 바퀴 12초)과 옅은 점 격자(투명도 8%)가 천천히 흐른다.
// 배경이 글자보다 눈에 띄면 안 되므로 변화 폭을 작게 잡았다. 모든 값은 frame에서 결정론적으로 계산한다.
const LOOP_SECONDS = 12;
const GRID = 56;

export const BackgroundAtmosphere: React.FC = () => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = (frame / (LOOP_SECONDS * fps)) * Math.PI * 2;
  const cx = 50 + Math.cos(t) * 14;
  const cy = 18 + Math.sin(t) * 10;
  const drift = (frame / (LOOP_SECONDS * fps)) * GRID; // 격자가 한 바퀴(12초)에 한 칸 흐른다

  return (
    <>
      <div
        style={{
          position: 'absolute',
          inset: 0,
          background: `radial-gradient(ellipse 120% 80% at ${cx}% ${cy}%, #1A2B4A 0%, ${COLORS.background} 62%, #0B1424 100%)`,
        }}
      />
      <div
        style={{
          position: 'absolute',
          inset: 0,
          opacity: 0.08,
          backgroundImage: 'radial-gradient(circle at 1.5px 1.5px, #FFFFFF 1.5px, transparent 0)',
          backgroundSize: `${GRID}px ${GRID}px`,
          backgroundPosition: `${drift}px ${drift}px`,
        }}
      />
    </>
  );
};
