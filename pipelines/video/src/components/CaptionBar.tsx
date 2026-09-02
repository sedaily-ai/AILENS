import React from 'react';
import { COLORS, FONT_FAMILY, FONT_WEIGHT } from '../styles/tokens';
import { useScale } from '../lib/layout';
import { CaptionText } from './CaptionText';
import { CaptionValue } from '../lib/schema';

// 컷 하단에 항상 노출되는 자막 바. narration(음성)과 별개로
// caption(화면 표기용 핵심 문장)을 보여준다.
export const CaptionBar: React.FC<{ text: CaptionValue }> = ({ text }) => {
  const scale = useScale();

  return (
    <div style={{ textAlign: 'center' }}>
      <div
        style={{
          display: 'inline-block',
          maxWidth: '100%',
          fontFamily: FONT_FAMILY,
          fontWeight: FONT_WEIGHT.bold,
          fontSize: 40 * scale,
          lineHeight: 1.4,
          // 2026-09-02 — 에듀테크풍 화이트 배경 톤으로 전환하며, 이 칩은
          // 더 이상 COLORS.text(전역 본문 텍스트)를 따라가지 않는다.
          // 예전엔 어두운 배경 위 반투명 네이비 칩 + 흰 글자였는데, 배경이
          // 흰색이 되면 어두운 칩 위에 어두운 글자가 겹쳐 안 보이게 된다.
          // 칩 자체는 배경 테마와 무관하게 항상 짙은 잉크 톤 위 흰 글자로
          // 고정 — 페이지가 다크로 되돌아가도 안전.
          color: '#FFFFFF',
          background: 'rgba(26, 22, 12, 0.82)',
          padding: `${14 * scale}px ${28 * scale}px`,
          borderRadius: 14 * scale,
        }}
      >
        <CaptionText value={text} />
      </div>
    </div>
  );
};
