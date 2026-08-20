import React from 'react';
import { SafeArea } from './SafeArea';
import { CaptionBar } from './CaptionBar';
import { BrandTag } from './BrandTag';
import { useScale } from '../lib/layout';
import { CaptionValue } from '../lib/schema';
import { COLORS, FONT_FAMILY, FONT_WEIGHT } from '../styles/tokens';
import { CAPTION_DELAY_SECONDS, useEntranceStyle } from '../lib/animation';

// 모든 컷 타입이 공유하는 레이아웃: 브랜드 태그(상단) / 본문(중앙, flex) / 자막(하단, 선택) / 출처(자막 아래, 선택).
// 브랜드+본문은 컷 시작과 동시에, 자막+출처는 0.2초 늦게 각자 페이드인+슬라이드업 한다.
export const CutLayout: React.FC<{
  brand: string;
  caption?: CaptionValue;
  sourceNote?: string;
  children: React.ReactNode;
}> = ({ brand, caption, sourceNote, children }) => {
  const scale = useScale();
  const bodyStyle = useEntranceStyle();
  const captionStyle = useEntranceStyle(CAPTION_DELAY_SECONDS);

  return (
    <SafeArea>
      <div style={{ ...bodyStyle, display: 'flex', flexDirection: 'column', flex: 1 }}>
        <BrandTag text={brand} />
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 24 * scale,
          }}
        >
          {children}
        </div>
      </div>
      {caption || sourceNote ? (
        <div style={captionStyle}>
          {caption ? <CaptionBar text={caption} /> : null}
          {sourceNote ? (
            <div
              style={{
                textAlign: 'center',
                marginTop: 10 * scale,
                fontFamily: FONT_FAMILY,
                fontWeight: FONT_WEIGHT.medium,
                fontSize: 20 * scale,
                color: COLORS.muted,
              }}
            >
              {sourceNote}
            </div>
          ) : null}
        </div>
      ) : null}
    </SafeArea>
  );
};
