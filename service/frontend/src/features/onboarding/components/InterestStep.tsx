'use client';

import { useState } from 'react';
import { LENS_ACCENT } from '@/shared/constants/lensPerspectives';
import { onboardingPrimaryButtonStyle } from '../lib/onboardingButton';
import { OnboardingHeader } from './OnboardingHeader';

// STEP 4 — 관심 분야. "지면 특별 코너" taxonomy(LensPreviewSection.tsx의
// SECTIONS)와 동일한 4개 값. "전체"는 나머지 3개와 배타적(라디오처럼) —
// 정규화 규칙(resultCopy.ts의 normalizeInterests)이 이 배타성을 전제로 한다.
const CATEGORIES = ['전체', '증권', '산업', '시그널'];

export function InterestStep({
  initialSelected,
  onContinue,
  onSkip,
  onBack,
}: {
  initialSelected: string[];
  onContinue: (selected: string[]) => void;
  onSkip: () => void;
  onBack?: () => void;
}) {
  const [selected, setSelected] = useState<string[]>(initialSelected);

  const toggle = (cat: string) => {
    setSelected((prev) => {
      if (cat === '전체') return prev.includes('전체') ? [] : ['전체'];
      const withoutAll = prev.filter((c) => c !== '전체');
      return withoutAll.includes(cat) ? withoutAll.filter((c) => c !== cat) : [...withoutAll, cat];
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: '#ffffff' }}>
      <OnboardingHeader currentStep={3} onSkip={onSkip} onBack={onBack} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 30px', textAlign: 'center', gap: 12 }}>
        <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.22em', textTransform: 'uppercase' }}>
          관심 분야
        </p>
        <h1 style={{ margin: 0, fontFamily: '"Noto Serif KR", serif', fontSize: 24, fontWeight: 700, lineHeight: 1.4, letterSpacing: '-0.02em', color: '#0f172a' }}>
          특히 관심 있는
          <br />
          분야가 있으신가요?
        </h1>
        <p style={{ margin: '0 0 10px', fontSize: 13, color: '#6b7280' }}>여러 개 골라도 좋아요</p>

        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 10 }}>
          {CATEGORIES.map((cat) => {
            const on = selected.includes(cat);
            return (
              <button
                key={cat}
                type="button"
                onClick={() => toggle(cat)}
                aria-pressed={on}
                style={{
                  padding: '10px 18px',
                  borderRadius: 999,
                  background: on ? LENS_ACCENT : '#ffffff',
                  border: `1px solid ${on ? LENS_ACCENT : '#e5e7eb'}`,
                  fontSize: 14,
                  fontWeight: on ? 700 : 600,
                  color: on ? '#ffffff' : '#475569',
                  cursor: 'pointer',
                }}
              >
                {cat}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ padding: '18px 22px 26px', maxWidth: 420, margin: '0 auto', width: '100%' }}>
        <button type="button" onClick={() => onContinue(selected)} style={onboardingPrimaryButtonStyle()}>
          다음 →
        </button>
      </div>
    </div>
  );
}
