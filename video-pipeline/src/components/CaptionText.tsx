import React from 'react';
import { interpolateColors } from 'remotion';
import { CaptionValue } from '../lib/schema';
import { COLORS } from '../styles/tokens';

// caption이 문자열이면 그대로, 세그먼트 배열이면 emphasis 구간만 앰버로 칠한다.
// emphasisProgress(0..1)를 주면 흰색→앰버 색 전환을 그 진행도에 맞춰 애니메이션한다 (기본값 1 = 즉시 완료).
// 감싸는 요소가 기본 텍스트 색(대개 COLORS.text)을 지정해두면 나머지는 inherit로 맞춰진다.
export const CaptionText: React.FC<{ value: CaptionValue; emphasisProgress?: number }> = ({
  value,
  emphasisProgress = 1,
}) => {
  if (typeof value === 'string') {
    return <>{value}</>;
  }
  const emphasisColor = interpolateColors(emphasisProgress, [0, 1], [COLORS.text, COLORS.accent]);
  return (
    <>
      {value.map((segment, i) => (
        <span key={i} style={{ color: segment.emphasis ? emphasisColor : 'inherit' }}>
          {segment.text}
        </span>
      ))}
    </>
  );
};
