import React from 'react';
import { COLORS, FONT_FAMILY, FONT_WEIGHT } from '../styles/tokens';
import { useScale } from '../lib/layout';
import { CaptionText } from './CaptionText';
import { CaptionValue } from '../lib/schema';

// 컷 하단에 항상 노출되는 자막 바. narration(음성)과 별개로
// caption(화면 표기용 핵심 문장)을 보여준다.
export const CaptionBar: React.FC<{ text: CaptionValue }> = ({ text }) => {
  const scale = useScale();

  return (
    <div style={{ textAlign: 'center' }}>
      <div
        style={{
          display: 'inline-block',
          maxWidth: '100%',
          fontFamily: FONT_FAMILY,
          fontWeight: FONT_WEIGHT.bold,
          fontSize: 40 * scale,
          lineHeight: 1.4,
          color: COLORS.text,
          background: 'rgba(15, 26, 46, 0.72)',
          padding: `${14 * scale}px ${28 * scale}px`,
          borderRadius: 14 * scale,
        }}
      >
        <CaptionText value={text} />
      </div>
    </div>
  );
};
