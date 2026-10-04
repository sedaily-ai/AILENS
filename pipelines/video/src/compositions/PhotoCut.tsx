import React from 'react';
import { AbsoluteFill, Img } from 'remotion';
import { SafeArea } from '../components/SafeArea';
import { CaptionBar } from '../components/CaptionBar';
import { BrandTag } from '../components/BrandTag';
import { PhotoCutType } from '../lib/schema';
import { useScale } from '../lib/layout';
import { CAPTION_DELAY_SECONDS, useEntranceStyle } from '../lib/animation';

// 다른 컷과 달리 CutLayout을 쓰지 않는다. CutLayout은 BackgroundAtmosphere 배경이 비치는 것을 전제로
// 본문을 중앙 정렬하는데, 이 컷은 원문 사진이 풀블리드 배경이라 그 위에서도 브랜드 태그·자막이 읽혀야
// 한다. 그래서 위/아래에 다크 스크림을 깔고 그 위에 SafeArea를 얹는 구조로 직접 구성한다.
export const PhotoCut: React.FC<{ cut: PhotoCutType; brand: string }> = ({ cut, brand }) => {
  const scale = useScale();
  const bodyStyle = useEntranceStyle();
  const captionStyle = useEntranceStyle(CAPTION_DELAY_SECONDS);
  const { url, credit } = cut.data;

  return (
    <AbsoluteFill>
      <Img src={url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
      <AbsoluteFill
        style={{
          background:
            'linear-gradient(to bottom, rgba(15,26,46,0.55) 0%, rgba(15,26,46,0) 22%, ' +
            'rgba(15,26,46,0) 68%, rgba(15,26,46,0.72) 100%)',
        }}
      />
      <SafeArea>
        <div style={bodyStyle}>
          <BrandTag text={brand} />
        </div>
        <div style={{ flex: 1 }} />
        <div style={captionStyle}>
          {cut.caption ? <CaptionBar text={cut.caption} /> : null}
          {credit ? (
            <div
              style={{
                textAlign: 'right',
                marginTop: 10 * scale,
                fontFamily: 'inherit',
                fontSize: 32 * scale,
                color: 'rgba(255,255,255,0.75)',
              }}
            >
              {credit}
            </div>
          ) : null}
        </div>
      </SafeArea>
    </AbsoluteFill>
  );
};
