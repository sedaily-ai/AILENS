import React from 'react';
import { COLORS, FONT_FAMILY, FONT_WEIGHT } from '../styles/tokens';
import { useScale } from '../lib/layout';

// 왼쪽 위 고정 라벨(프롬프트 §7): 기사 핵심 명사(2~8자)와 그 아래 작게 기준 시점.
// 알약 배경 없이 작은 점 + 글자만. 장식이 아니라 "지금 무엇에 대한 이야기인지"만 조용히 알린다.
export const KeywordLabel: React.FC<{ keyword: string; asOfDate?: string }> = ({ keyword, asOfDate }) => {
  const scale = useScale();
  return (
    <div style={{ fontFamily: FONT_FAMILY }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 * scale }}>
        <span style={{ width: 14 * scale, height: 14 * scale, borderRadius: 999, background: COLORS.accent }} />
        <span style={{ fontWeight: FONT_WEIGHT.bold, fontSize: 38 * scale, color: COLORS.text, letterSpacing: -0.3 }}>{keyword}</span>
      </div>
      {asOfDate ? (
        <div style={{ marginTop: 10 * scale, marginLeft: 28 * scale, fontWeight: FONT_WEIGHT.medium, fontSize: 28 * scale, color: COLORS.muted }}>
          {asOfDate}
        </div>
      ) : null}
    </div>
  );
};
