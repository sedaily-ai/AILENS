'use client';

import { LENS_CARD_BORDER, LENS_CARD_SHADOW, READING_ACCENT } from '@/shared/constants/lensPerspectives';
import { MBTI_GROUP_ORDER, typesOfGroup, type MbtiType } from '../lib/mbtiCorner';

// 4×4 격자 — 한 줄이 한 그룹(NT·NF·ST·SF). 모바일에서도 4열을 유지한다(390px에서 칸당 약 80px).
export function TypePicker({ selected, onSelect }: { selected: MbtiType | null; onSelect: (type: MbtiType) => void }) {
  return (
    <div role="group" aria-label="내 MBTI 고르기" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: 8 }}>
      {MBTI_GROUP_ORDER.flatMap((g) => typesOfGroup(g)).map((type) => {
        const on = selected === type;
        return (
          <button
            key={type}
            type="button"
            aria-pressed={on}
            onClick={() => onSelect(type)}
            style={{
              padding: '14px 0',
              borderRadius: 12,
              border: on ? `1.5px solid ${READING_ACCENT}` : LENS_CARD_BORDER,
              background: on ? '#eff6ff' : '#ffffff',
              boxShadow: LENS_CARD_SHADOW,
              fontSize: 15,
              fontWeight: 700,
              letterSpacing: '0.04em',
              color: '#0f172a',
              cursor: 'pointer',
            }}
          >
            {type}
          </button>
        );
      })}
    </div>
  );
}
