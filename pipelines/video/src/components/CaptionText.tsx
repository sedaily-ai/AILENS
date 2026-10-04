import React from 'react';
import { interpolateColors, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import { CaptionValue } from '../lib/schema';
import { COLORS } from '../styles/tokens';
import { SPRING_EMPHASIS } from '../lib/animation';

// caption이 문자열이면 그대로, 세그먼트 배열이면 emphasis 구간만 앰버로 칠한다.
// 2026-10-03(프롬프트 §5·§10): 강조어는 다른 단어보다 0.2~0.3초 늦게, 크게(기본 1.6배), 앰버로, 살짝 튀며(damping 9 / stiffness 180) 나타난다.
// emphasisProgress를 직접 주면(하이라이트 컷의 테두리 이후 전환 등) 그 진행도를 색에 쓰고, 안 주면 delaySeconds 뒤 스프링으로 자동 진행한다.
export const CaptionText: React.FC<{
  value: CaptionValue;
  emphasisProgress?: number;
  /** 강조어 글자 크기 배율(em). 기본 1.6. */
  emphasisSize?: number;
  /** 컷 시작 후 강조가 시작되는 지연(초). 기본 0.3. */
  delaySeconds?: number;
}> = ({ value, emphasisProgress, emphasisSize = 1.6, delaySeconds = 0.3 }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame: frame - Math.round(delaySeconds * fps), fps, config: SPRING_EMPHASIS });

  if (typeof value === 'string') {
    return <>{value}</>;
  }
  const progress = emphasisProgress ?? Math.min(1, Math.max(0, pop));
  const emphasisColor = interpolateColors(progress, [0, 1], [COLORS.text, COLORS.accent]);
  const size = 1 + (emphasisSize - 1) * Math.min(1.12, Math.max(0, pop)); // 튀며 커진다(오버슈트 허용)
  return (
    <>
      {value.map((segment, i) =>
        segment.emphasis ? (
          <span key={i} style={{ color: emphasisColor, fontWeight: 900, fontSize: `${size}em`, lineHeight: 1.1 }}>
            {segment.text}
          </span>
        ) : (
          <span key={i} style={{ color: 'inherit' }}>
            {segment.text}
          </span>
        ),
      )}
    </>
  );
};
