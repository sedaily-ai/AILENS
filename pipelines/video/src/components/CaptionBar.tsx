import React from 'react';
import { COLORS, FONT_FAMILY, FONT_WEIGHT } from '../styles/tokens';
import { useIsVertical, useScale } from '../lib/layout';
import { CaptionText } from './CaptionText';
import { CaptionValue } from '../lib/schema';

// 하단 큰 자막(프롬프트 §5·§7): 박스 없이 왼쪽 정렬 큰 글자(72px 이상). 나레이션과 다른 12자 이하 꼴, 강조어는 앰버·1.5배.
export const CaptionBar: React.FC<{ text: CaptionValue }> = ({ text }) => {
  const scale = useScale();
  const vertical = useIsVertical();
  return (
    <div
      style={{
        fontFamily: FONT_FAMILY,
        fontWeight: FONT_WEIGHT.extrabold,
        fontSize: 80 * scale,
        lineHeight: 1.22,
        letterSpacing: -1.2,
        color: COLORS.text,
        wordBreak: 'keep-all',
        textAlign: vertical ? 'left' : 'center',
      }}
    >
      <CaptionText value={text} emphasisSize={1.3} />
    </div>
  );
};
