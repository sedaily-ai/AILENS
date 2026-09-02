'use client';

import { Briefcase, TrendingUp, Globe } from 'lucide-react';

// STEP 1 — 목표 질문. 듀오링고식: 가입 없이, 답은 STEP 4(관심분야) 프리체크에만
// 쓰인다(OnboardingFlow.tsx의 GOAL_TO_INTEREST) — 그 외엔 순수 선택 UX.
export type OnboardingGoal = 'work' | 'invest' | 'culture';

const OPTIONS: { goal: OnboardingGoal; label: string; desc: string; icon: typeof Briefcase }[] = [
  { goal: 'work', label: '업무 참고', desc: '업무에 필요한 정보를 놓치지 않으려고', icon: Briefcase },
  { goal: 'invest', label: '투자 판단', desc: '내 자산과 관련된 흐름을 보려고', icon: TrendingUp },
  { goal: 'culture', label: '그냥 교양', desc: '세상 돌아가는 걸 알고 싶어서', icon: Globe },
];

export function GoalStep({
  onSelect,
  onSkip,
}: {
  onSelect: (goal: OnboardingGoal) => void;
  onSkip: () => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: '#ffffff' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '22px 22px 0' }}>
        <span style={{ fontFamily: '"Noto Serif KR", serif', fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
          AI LENS
        </span>
        <button
          type="button"
          onClick={onSkip}
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: '#94a3b8' }}
        >
          건너뛰기 →
        </button>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '8px 24px', gap: 28, maxWidth: 420, margin: '0 auto', width: '100%' }}>
        <div style={{ textAlign: 'center' }}>
          <p style={{ margin: '0 0 14px', fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.22em', textTransform: 'uppercase' }}>
            AI LENS를 시작하며
          </p>
          <h1 style={{ margin: 0, fontFamily: '"Noto Serif KR", serif', fontSize: 26, fontWeight: 700, lineHeight: 1.35, letterSpacing: '-0.02em', color: '#0f172a' }}>
            왜 뉴스를
            <br />
            챙기시나요?
          </h1>
          <p style={{ margin: '10px 0 0', fontSize: 13, color: '#6b7280' }}>가장 가까운 걸 골라주세요</p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {OPTIONS.map(({ goal, label, desc, icon: Icon }) => (
            <button
              key={goal}
              type="button"
              onClick={() => onSelect(goal)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: 18,
                borderRadius: 14,
                background: '#ffffff',
                border: '1.5px solid #e5e7eb',
                cursor: 'pointer',
                textAlign: 'left',
                width: '100%',
              }}
            >
              <div style={{ width: 38, height: 38, borderRadius: 10, background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon size={19} color="#475569" strokeWidth={2} />
              </div>
              <div>
                <div style={{ fontSize: 14.5, fontWeight: 700, color: '#0f172a' }}>{label}</div>
                <div style={{ fontSize: 12, color: '#6b7280', marginTop: 2 }}>{desc}</div>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div style={{ textAlign: 'center', padding: '0 0 28px' }}>
        <p style={{ margin: 0, fontSize: 11, color: '#9ca3af' }}>가입 없이 계속할 수 있어요</p>
      </div>
    </div>
  );
}
