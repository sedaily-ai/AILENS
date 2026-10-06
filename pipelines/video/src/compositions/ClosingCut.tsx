import React from 'react';
import { CutLayout } from '../components/CutLayout';
import { KineticText } from '../components/KineticText';
import { ClosingCutType } from '../lib/schema';
import { COLORS, FONT_FAMILY, FONT_WEIGHT } from '../styles/tokens';
import { useIsVertical, useScale } from '../lib/layout';
import { useEnterProgress } from '../lib/animation';

// 마무리(프롬프트 §6): 전면 타이포와 같은 방식에 움직임을 더 느리게. 출처와 안내 문구는 아래에 작게.
export const ClosingCut: React.FC<{
  cut: ClosingCutType;
  brand: string;
  source: string;
  disclaimer?: string;
}> = ({ cut, brand, source, disclaimer }) => {
  const scale = useScale();
  const vertical = useIsVertical();
  const metaIn = useEnterProgress(1.0);

  return (
    <CutLayout brand={brand} contentAlign="center">
      <KineticText value={cut.caption} size={124} slow />
      <div style={{ marginTop: 90 * scale, opacity: metaIn, fontFamily: FONT_FAMILY, textAlign: vertical ? 'left' : 'center' }}>
        <div style={{ fontWeight: FONT_WEIGHT.medium, fontSize: 30 * scale, color: COLORS.muted }}>{source}</div>
        {disclaimer ? (
          <div style={{ marginTop: 10 * scale, fontWeight: FONT_WEIGHT.regular, fontSize: 26 * scale, color: COLORS.muted, opacity: 0.85, lineHeight: 1.5 }}>{disclaimer}</div>
        ) : null}
      </div>
    </CutLayout>
  );
};
