import React from 'react';
import { CutLayout } from '../components/CutLayout';
import { Icon } from '../components/Icon';
import { KineticText } from '../components/KineticText';
import { OpeningCutType } from '../lib/schema';
import { COLORS } from '../styles/tokens';
import { useScale } from '../lib/layout';
import { useEnterProgress } from '../lib/animation';

// 첫 컷. 둥근 아이콘 원 대신 부드러운 타일, 제목은 전면 타이포(단어가 하나씩 올라옴).
// 기준 시점은 왼쪽 위 키워드 라벨 아래에 상시 보인다(없으면 이 컷에서 따로 보이지 않는다).
export const OpeningCut: React.FC<{ cut: OpeningCutType; brand: string; asOfDate?: string }> = ({ cut, brand }) => {
  const scale = useScale();
  const tileIn = useEnterProgress();
  const tile = 168 * scale;

  return (
    <CutLayout brand={brand} contentAlign="center">
      <div
        style={{
          width: tile,
          height: tile,
          borderRadius: tile * 0.28,
          background: 'linear-gradient(160deg, #26385F 0%, #1B2A48 100%)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: tileIn,
          transform: `scale(${0.85 + 0.15 * tileIn})`,
          marginBottom: 20 * scale,
        }}
      >
        <Icon name={cut.data.icon} size={tile * 0.46} color={COLORS.accent} strokeWidth={1.8} />
      </div>
      <KineticText value={cut.caption} size={120} />
    </CutLayout>
  );
};
