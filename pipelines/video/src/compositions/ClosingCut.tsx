import React from 'react';
import { interpolate } from 'remotion';
import { CutLayout } from '../components/CutLayout';
import { Icon } from '../components/Icon';
import { CaptionText } from '../components/CaptionText';
import { ClosingCutType } from '../lib/schema';
import { COLORS, FONT_FAMILY, FONT_WEIGHT } from '../styles/tokens';
import { useScale } from '../lib/layout';
import { useEnterProgress } from '../lib/animation';

const BRIGHTNESS_RISE_SECONDS = 1.2;
const MAX_BRIGHTNESS_OPACITY = 0.05;

export const ClosingCut: React.FC<{
  cut: ClosingCutType;
  brand: string;
  source: string;
  disclaimer?: string;
}> = ({ cut, brand, source, disclaimer }) => {
  const scale = useScale();
  const iconProgress = useEnterProgress();
  const iconScale = interpolate(iconProgress, [0, 1], [0.8, 1]);
  const brightnessOpacity = useEnterProgress(0, BRIGHTNESS_RISE_SECONDS) * MAX_BRIGHTNESS_OPACITY;

  return (
    <>
      {/* 배경 밝기 소폭 상승 — 화면 전체를 옅은 화이트로 은은하게 덮는다 */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          backgroundColor: '#FFFFFF',
          opacity: brightnessOpacity,
        }}
      />
      <CutLayout brand={brand}>
        <div
          style={{
            width: 128 * scale,
            height: 128 * scale,
            borderRadius: '50%',
            background: COLORS.backgroundLight,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            transform: `scale(${iconScale})`,
          }}
        >
          <Icon name="megaphone" size={64 * scale} color={COLORS.accent} strokeWidth={1.6} />
        </div>
        <div
          style={{
            fontFamily: FONT_FAMILY,
            fontWeight: FONT_WEIGHT.extrabold,
            fontSize: 46 * scale,
            color: COLORS.text,
            textAlign: 'center',
            lineHeight: 1.4,
            maxWidth: '88%',
          }}
        >
          <CaptionText value={cut.caption} />
        </div>
        <div
          style={{
            marginTop: 12 * scale,
            fontFamily: FONT_FAMILY,
            fontWeight: FONT_WEIGHT.medium,
            fontSize: 22 * scale,
            color: COLORS.muted,
            textAlign: 'center',
          }}
        >
          {source}
        </div>
        {disclaimer ? (
          <div
            style={{
              marginTop: 4 * scale,
              fontFamily: FONT_FAMILY,
              fontWeight: FONT_WEIGHT.regular,
              fontSize: 18 * scale,
              color: COLORS.muted,
              opacity: 0.8,
              textAlign: 'center',
              maxWidth: '80%',
              lineHeight: 1.5,
            }}
          >
            {disclaimer}
          </div>
        ) : null}
      </CutLayout>
    </>
  );
};
