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
//
// asOfDate(2026-09 신설) — "첫 화면에 기준 시점을 표시해달라"는 기자
// 피드백. 굳이 모든 컷에 상시 노출하지 않고 첫 컷에만 한 번 — 시청자가
// "이게 언제 기준 정보인지" 아는 게 목적이지 매 컷 화면을 잠식할 필요는
// 없어서(레터/팟캐스트도 기준일을 한 번만 언급하는 것과 같은 원칙).
//
// 2026-09-02 — 실제 발행 영상에서 "...가계부채는 2025년 6월 말 기준)
// 기준"처럼 "기준"이 중복되는 걸 발견. 원인: DDB 비디오 프롬프트의
// asOfDate 예시("2027년도 예산안 기준", "2026.9.1 발표")는 이미 완결된
// 문구인데, 여기서 항상 " 기준"을 덧붙이고 있었다. 모델이 완결된 문구를
// 쓰도록 프롬프트가 설계돼 있으므로, 프롬프트가 아니라 이 렌더 쪽의
// 덧붙이기를 제거하는 게 맞는 수정.
export const OpeningCut: React.FC<{ cut: OpeningCutType; brand: string; asOfDate?: string }> = ({
  cut,
  brand,
  asOfDate,
}) => {
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
      {asOfDate ? (
        <div
          style={{
            fontFamily: FONT_FAMILY,
            fontWeight: FONT_WEIGHT.medium,
            fontSize: 22 * scale,
            color: COLORS.muted,
            opacity: titleOpacity,
          }}
        >
          {asOfDate}
        </div>
      ) : null}
    </CutLayout>
  );
};
