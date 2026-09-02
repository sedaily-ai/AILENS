import React from 'react';
import { interpolate, useCurrentFrame, useVideoConfig } from 'remotion';

// 2026-09-02 — 톤앤매너 다듬기 3종 세트 중 배경 패럴랙스. 기존엔 완전히
// 정적인 그라디언트였다 — 영상 전체 길이에 걸쳐 글로우 중심이 아주
// 느리게 대각선으로 흘러가게 해서 "살아있는" 느낌을 준다. setTimeout/
// CSS animation 대신 interpolate(frame, ...)로 매 프레임 결정론적으로
// 계산 — 몇 초짜리 컷이든 영상 전체든 동일하게 순수 함수로 동작한다.
// 움직임 폭을 작게 잡아(중심 좌표 ±8%) 컷 내용을 방해하지 않는 "은은한
// 대기감" 정도로 제한.
export const BackgroundAtmosphere: React.FC = () => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();

  const cx = interpolate(frame, [0, durationInFrames], [42, 58], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });
  const cy = interpolate(frame, [0, durationInFrames], [-15, -5], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        background: `radial-gradient(ellipse 140% 90% at ${cx}% ${cy}%, #FFFFFF 0%, #FEFCF8 55%, #FBF6EC 100%)`,
      }}
    />
  );
};
