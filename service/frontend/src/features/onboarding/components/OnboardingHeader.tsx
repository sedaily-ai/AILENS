'use client';

import Link from 'next/link';
import { ChevronLeft, Home } from 'lucide-react';
import { LENS_ACCENT } from '@/shared/constants/lensPerspectives';

// 온보딩 단계 공용 헤더 — "AI LENS" 워드마크 + 세그먼트 진행바 + 스킵 버튼.
// 세그먼트 진행바로 모든 스텝에서 전체 중 현재 위치를 보여 주며, 스킵 버튼은 onSkip이 있는 스텝에서만 표시한다.
// onBack은 OnboardingFlow.tsx가 실제 이동 이력(history 스택)을 가지고 canGoBack일 때만 넘긴다. 스킵으로 건너뛴 단계는 이력에 남지 않으므로 뒤로가기에서도 건너뛴다.
// 뒤로가기 버튼은 원형 배경 칩으로 눌 수 있음을 드러내고 active 스케일·hover 톤 변화로 반응하게 한다(LensPreviewSection.tsx의 `.lz-arrow`와 같은 패턴).
const ONBOARDING_TOTAL_STEPS = 6;

export function OnboardingHeader({
  currentStep = 0,
  hideProgress = false,
  contentMaxWidth,
  onSkip,
  skipLabel = '건너뛰기 →',
  onBack,
}: {
  /** 1-indexed 진행 칸(옛 6단계 위저드용). 2화면 구성에서는 hideProgress로 진행바를 숨긴다. */
  currentStep?: number;
  hideProgress?: boolean;
  /** 아래 본문 칼럼의 최대 폭 — 지정하면 헤더도 같은 폭으로 가운데 정렬해 좌우 끝선을 본문과 맞춘다. */
  contentMaxWidth?: number;
  onSkip?: () => void;
  skipLabel?: string;
  onBack?: () => void;
}) {
  return (
    <div style={{ padding: '22px 22px 0', maxWidth: contentMaxWidth, margin: '0 auto', width: '100%' }}>
      <style>{`
        .ob-back-btn { transition: background .15s ease, transform .1s ease; }
        .ob-back-btn:hover { background: #e9edf3; }
        .ob-back-btn:active { transform: scale(.92); }
      `}</style>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              aria-label="이전 단계로"
              className="ob-back-btn"
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: '50%', background: '#f1f5f9', border: 'none', color: '#475569', cursor: 'pointer' }}
            >
              <ChevronLeft size={18} strokeWidth={2.4} />
            </button>
          )}
          <Link href="/" aria-label="홈으로" style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: '"Noto Serif KR", serif', fontSize: 13, fontWeight: 700, color: '#0f172a', textDecoration: 'none' }}>
            <Home size={16} strokeWidth={2.1} color="#475569" aria-hidden />
            AI LENS
          </Link>
        </div>
        {onSkip && (
          <button
            type="button"
            onClick={onSkip}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: '#94a3b8' }}
          >
            {skipLabel}
          </button>
        )}
      </div>
      {!hideProgress && <div style={{ display: 'flex', gap: 4, marginTop: 14 }} aria-hidden>
        {Array.from({ length: ONBOARDING_TOTAL_STEPS }, (_, i) => (
          <div
            key={i}
            style={{
              flex: 1,
              height: 3,
              borderRadius: 999,
              background: i < currentStep ? LENS_ACCENT : '#e5e7eb',
              transition: 'background .2s ease',
            }}
          />
        ))}
      </div>}
    </div>
  );
}
