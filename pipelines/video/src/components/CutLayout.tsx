import React, { useContext } from 'react';
import { SafeArea } from './SafeArea';
import { CaptionBar } from './CaptionBar';
import { BrandTag } from './BrandTag';
import { KeywordLabel } from './KeywordLabel';
import { ScriptMetaContext } from './ScriptMeta';
import { useIsVertical, useScale } from '../lib/layout';
import { CaptionValue } from '../lib/schema';
import { COLORS, FONT_FAMILY, FONT_WEIGHT } from '../styles/tokens';
import { CAPTION_DELAY_SECONDS, useEntranceStyle } from '../lib/animation';

// 모든 컷이 공유하는 레이아웃: 왼쪽 위 키워드 라벨 / 본문 / 하단 큰 자막(왼쪽 정렬) + 출처.
// 토스·에듀 인포그래픽처럼 왼쪽 정렬 타이포 한 축으로 세운다. 박스·테두리 장식은 쓰지 않는다.
export const CutLayout: React.FC<{
  brand: string;
  caption?: CaptionValue;
  sourceNote?: string;
  /** 본문 세로 정렬: center(기본, 도표·수치) / start(전면 타이포는 위쪽에서 시작) */
  contentAlign?: 'center' | 'start';
  children: React.ReactNode;
}> = ({ brand, caption, sourceNote, contentAlign = 'center', children }) => {
  const scale = useScale();
  const vertical = useIsVertical();
  const meta = useContext(ScriptMetaContext);
  const bodyStyle = useEntranceStyle();
  const captionStyle = useEntranceStyle(CAPTION_DELAY_SECONDS);

  return (
    <SafeArea>
      <div style={{ ...bodyStyle, display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>
        {meta.keyword ? <KeywordLabel keyword={meta.keyword} asOfDate={meta.asOfDate} /> : <BrandTag text={brand} />}
        <div
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            alignItems: vertical ? 'flex-start' : 'center',
            justifyContent: contentAlign === 'center' ? 'center' : 'flex-start',
            paddingTop: contentAlign === 'start' ? 150 * scale : 0,
            textAlign: vertical ? 'left' : 'center',
            gap: 28 * scale,
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
                marginTop: 18 * scale,
                fontFamily: FONT_FAMILY,
                fontWeight: FONT_WEIGHT.medium,
                fontSize: 30 * scale,
                color: COLORS.muted,
                textAlign: vertical ? 'left' : 'center',
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
