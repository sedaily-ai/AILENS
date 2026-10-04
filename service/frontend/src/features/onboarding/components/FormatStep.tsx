'use client';

import { lensPerspectiveAt, LENS_FORMATS } from '@/shared/constants/lensPerspectives';
import type { CmsLens } from '@/shared/lib/api/cmsPostsApi';
import { OnboardingHeader } from './OnboardingHeader';

// "하루의 틈" 장면이 안 맞는 사람을 위한 우회로 — 오늘의 1면을 어떤 포맷으로 볼지 직접 고른다.
// (2026-10-04 이전엔 STEP 2였고 5초 뒤 레터로 자동 진행했다. 직접 고르겠다고 온 사람에게 타이머는 맞지 않아 뺐다.)
export function FormatStep({
  lens,
  onSelect,
  onSkip,
  onBack,
}: {
  lens: CmsLens | null;
  onSelect: (index: number) => void;
  onSkip: () => void;
  onBack?: () => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: '#ffffff' }}>
      <OnboardingHeader currentStep={1} onSkip={onSkip} onBack={onBack} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '8px 24px', textAlign: 'center', gap: 14, maxWidth: 420, margin: '0 auto', width: '100%' }}>
        <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.22em', textTransform: 'uppercase' }}>
          오늘의 1면
        </p>
        <h1 style={{ margin: 0, fontFamily: '"Noto Serif KR", serif', fontSize: 26, fontWeight: 700, lineHeight: 1.35, letterSpacing: '-0.02em', color: '#0f172a' }}>
          오늘의 1면,
          <br />
          어떻게 볼까요?
        </h1>
        {lens && (
          <p style={{ margin: 0, fontSize: 13, lineHeight: 1.6, color: '#475569', maxWidth: 320 }}>{lens.headline}</p>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: 12, width: '100%', marginTop: 6 }}>
          {LENS_FORMATS.map((_, i) => {
            const p = lensPerspectiveAt(i);
            const Icon = p.icon;
            return (
              <button
                key={p.short}
                type="button"
                onClick={() => onSelect(i)}
                style={{
                  background: p.tint,
                  border: '1px solid rgba(0,0,0,0.06)',
                  borderRadius: 16,
                  padding: 16,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  minHeight: 126,
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <div style={{ width: 32, height: 32, borderRadius: 8, background: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={18} color={p.color} strokeWidth={2} />
                </div>
                <div style={{ fontSize: 15, fontWeight: 700, color: '#0f172a' }}>{p.short}</div>
                <div style={{ fontSize: 11.5, lineHeight: 1.5, color: '#6b7280' }}>{p.tagline}</div>
              </button>
            );
          })}
        </div>
      </div>

    </div>
  );
}
