import React from 'react';
import { interpolate } from 'remotion';
import { CutLayout } from '../components/CutLayout';
import { Icon } from '../components/Icon';
import { CaptionText } from '../components/CaptionText';
import { OpeningCutType } from '../lib/schema';
import { COLORS, FONT_FAMILY, FONT_WEIGHT } from '../styles/tokens';
import { useScale } from '../lib/layout';
import { useEnterProgress } from '../lib/animation';

const TITLE_DELAY_SECONDS = 0.25;

// 첫 컷. caption을 제목 카드처럼 크게 노출하므로 하단 CaptionBar는 쓰지 않는다.
// 아이콘은 0.8→1 스케일업, 타이틀은 살짝 늦게 페이드인.
export const OpeningCut: React.FC<{ cut: OpeningCutType; brand: string }> = ({ cut, brand }) => {
  const scale = useScale();
  const iconProgress = useEnterProgress();
  const iconScale = interpolate(iconProgress, [0, 1], [0.8, 1]);
  const titleOpacity = useEnterProgress(TITLE_DELAY_SECONDS);

  return (
    <CutLayout brand={brand}>
      <div
        style={{
          width: 176 * scale,
          height: 176 * scale,
          borderRadius: '50%',
          background: COLORS.backgroundLight,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transform: `scale(${iconScale})`,
        }}
      >
        <Icon name={cut.data.icon} size={92 * scale} color={COLORS.accent} strokeWidth={1.6} />
      </div>
      <div
        style={{
          fontFamily: FONT_FAMILY,
          fontWeight: FONT_WEIGHT.extrabold,
          fontSize: 64 * scale,
          color: COLORS.text,
          textAlign: 'center',
          lineHeight: 1.35,
          maxWidth: '92%',
          opacity: titleOpacity,
        }}
      >
        <CaptionText value={cut.caption} />
      </div>
    </CutLayout>
  );
};
