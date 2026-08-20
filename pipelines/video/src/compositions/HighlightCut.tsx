import React from 'react';
import { CutLayout } from '../components/CutLayout';
import { CaptionText } from '../components/CaptionText';
import { HighlightCutType } from '../lib/schema';
import { COLORS, FONT_FAMILY, FONT_WEIGHT } from '../styles/tokens';
import { useScale } from '../lib/layout';
import { HIGHLIGHT_BOX_DRAW_SECONDS, HIGHLIGHT_EMPHASIS_SECONDS, useDelayedProgress, useFrames } from '../lib/animation';

// 박스 테두리가 먼저 그려지고(SVG stroke-dashoffset), 다 그려진 뒤 강조 구간이 흰색→앰버로 전환된다.
// 부분 문자열 매칭이 아니라 caption 세그먼트(emphasis: true)로 강조 구간을 명시한다.
export const HighlightCut: React.FC<{ cut: HighlightCutType; brand: string }> = ({
  cut,
  brand,
}) => {
  const scale = useScale();
  const borderFrames = useFrames(HIGHLIGHT_BOX_DRAW_SECONDS);
  const borderProgress = useDelayedProgress(0, borderFrames);
  const emphasisFrames = useFrames(HIGHLIGHT_EMPHASIS_SECONDS);
  const emphasisProgress = useDelayedProgress(borderFrames, emphasisFrames);

  const borderRadius = 20 * scale;
  const strokeWidth = 3 * scale;

  return (
    <CutLayout brand={brand}>
      <div
        style={{
          position: 'relative',
          borderRadius,
          padding: `${44 * scale}px ${56 * scale}px`,
          maxWidth: '90%',
        }}
      >
        <svg
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}
          preserveAspectRatio="none"
        >
          <rect
            x={strokeWidth / 2}
            y={strokeWidth / 2}
            width={`calc(100% - ${strokeWidth}px)`}
            height={`calc(100% - ${strokeWidth}px)`}
            rx={borderRadius - strokeWidth / 2}
            ry={borderRadius - strokeWidth / 2}
            fill="none"
            stroke={COLORS.accent}
            strokeWidth={strokeWidth}
            pathLength={1}
            strokeDasharray={1}
            strokeDashoffset={1 - borderProgress}
          />
        </svg>
        <div
          style={{
            fontFamily: FONT_FAMILY,
            fontWeight: FONT_WEIGHT.extrabold,
            fontSize: 52 * scale,
            lineHeight: 1.45,
            textAlign: 'center',
            color: COLORS.text,
          }}
        >
          <CaptionText value={cut.caption} emphasisProgress={emphasisProgress} />
        </div>
      </div>
    </CutLayout>
  );
};
