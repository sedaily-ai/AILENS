'use client';

import { ChevronLeft } from 'lucide-react';
import { LENS_ACCENT } from '@/shared/constants/lensPerspectives';

// 온보딩 7단계(GoalStep~DoneStep) 공용 헤더 — 2026-09-03, 디자인 통일 작업.
// 이전엔 7개 파일이 "AI LENS" 워드마크+스킵 버튼 마크업을 각자 복붙해뒀고,
// 그나마도 스텝마다 있다 없다 했다(Result/Subscribe/Done엔 아예 없었고,
// Interest만 진행 표시로 점 2개를 따로 그렸다) — 사용자가 "버튼이나
// 단계적으로 이동할 수 있는 것"을 봐달라고 지적한 부분. 세그먼트 진행바
// 하나로 모든 스텝이 "지금 전체 중 몇 번째"를 항상 볼 수 있게 하고,
// 스킵 버튼은 필요한 스텝에서만(onSkip 유무로) 보인다.
//
// onBack — 같은 지적("이전으로 가기도 있는건가요?")에 대한 후속. 이전엔
// SubscribeStep의 "수정" 링크 하나만 예외적으로 되돌아갈 수 있었고 나머지
// 6단계는 브라우저 뒤로가기 말곤 방법이 없었다. OnboardingFlow.tsx가
// 실제 이동 이력(history 스택)을 들고 있다가 canGoBack일 때만 이 prop을
// 넘긴다 — 스킵으로 건너뛴 단계(예: consume 슬롯이 비어 자동 스킵)는
// 이력에 안 남으므로 뒤로가기도 그 빈 화면을 다시 안 보여주고 자연스럽게
// 건너뛴다.
//
// 뒤로가기 버튼 재작업(2026-09-03, "좀 불친절한듯... 친근함이 들고
// 트렌디함이라는 생각이 들도록") — 처음엔 배경 없이 아이콘만 텍스트
// 옆에 붙여놔서(26px, 음수 마진으로 당김) 존재감이 약했다. 원형 배경
// 칩으로 바꿔 그 자체로 "누를 수 있는 것"이 한눈에 보이게 하고, 눌렀을
// 때 살짝 눌리는 스케일 반응(active)과 호버 시 톤 변화를 더해 정적인
// 아이콘이 아니라 반응하는 요소로 만들었다 — LensPreviewSection.tsx의
// `.lz-arrow`(원형 배경 화살표 버튼) 패턴과 같은 어휘.
export const ONBOARDING_TOTAL_STEPS = 7;

export function OnboardingHeader({
  currentStep,
  onSkip,
  skipLabel = '건너뛰기 →',
  onBack,
}: {
  /** 1-indexed — Goal=1, Format=2, Consume=3, Interest=4, Result=5, Subscribe=6, Done=7. */
  currentStep: number;
  onSkip?: () => void;
  skipLabel?: string;
  onBack?: () => void;
}) {
  return (
    <div style={{ padding: '22px 22px 0' }}>
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
          <span style={{ fontFamily: '"Noto Serif KR", serif', fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
            AI LENS
          </span>
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
      <div style={{ display: 'flex', gap: 4, marginTop: 14 }} aria-hidden>
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
      </div>
    </div>
  );
}
