import React from 'react';

// 2026-09-02 — 톤앤매너 다듬기 3종 세트(사용자 요청 — "애프터이펙트로 만든
// 느낌") 중 필름 그레인. feTurbulence는 SVG 필터 스펙상 고정 시드로
// 결정론적이다(Math.random() 금지 규칙과 무관 — 매 프레임 같은 인자로
// 호출하면 항상 같은 패턴, Remotion의 "순수 함수" 요구사항을 그대로
// 만족한다). 애니메이션 없이 정적 패턴 + mix-blend-mode:overlay 로만
// 깔아서 "디지털 평면" 느낌을 줄인다 — 프레임마다 재계산하는 애니메이션
// 그레인은 렌더 비용이 커지고 압축(h264)에서 오히려 지저분해지기 쉬워
// 이번엔 정적으로 제한.
export const GrainOverlay: React.FC<{ opacity?: number }> = ({ opacity = 0.05 }) => (
  <svg
    style={{
      position: 'absolute',
      inset: 0,
      width: '100%',
      height: '100%',
      mixBlendMode: 'overlay',
      opacity,
      pointerEvents: 'none',
    }}
  >
    <filter id="ailens-grain">
      <feTurbulence type="fractalNoise" baseFrequency={0.85} numOctaves={3} seed={7} stitchTiles="stitch" />
      <feColorMatrix type="saturate" values="0" />
    </filter>
    <rect width="100%" height="100%" filter="url(#ailens-grain)" />
  </svg>
);
