import React from 'react';
import { COLORS, FONT_FAMILY, FONT_WEIGHT } from '../styles/tokens';
import { useScale } from '../lib/layout';

// 모든 컷 좌상단에 노출되는 상시 브랜드 워터마크.
export const BrandTag: React.FC<{ text: string }> = ({ text }) => {
  const scale = useScale();

  return (
    <div
      style={{
        fontFamily: FONT_FAMILY,
        fontWeight: FONT_WEIGHT.semibold,
        fontSize: 24 * scale,
        color: COLORS.muted,
        letterSpacing: 0.2,
      }}
    >
      {text}
    </div>
  );
};
