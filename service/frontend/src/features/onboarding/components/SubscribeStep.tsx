'use client';

import { lensPerspectiveAt, LENS_ACCENT } from '@/shared/constants/lensPerspectives';
import { NewsletterEmailField } from '@/shared/ui/NewsletterEmailField';
import { buildResultCopy, normalizeInterests } from '../lib/resultCopy';
import { OnboardingHeader } from './OnboardingHeader';

// STEP 6 — 이메일 구독. 여기서 처음 계정/이메일을 요청한다(STEP 1~5는
// 전부 비회원). 기존 NewsletterEmailField를 그대로 재사용 — 검증·동의
// 체크박스·에러 처리·구독 완료 상태를 다시 만들지 않는다.
//
// letter payload(구독 즉시 발송)는 이번 구현에서 생략 — NewsletterCTA.tsx가
// 쓰는 SubscribeLetterPayload는 todayLettersApi 형태라 CmsLens 데이터와
// 필드가 안 맞는다. letter 없이도 구독 자체는 정상 동작한다(옵셔널 prop).
//
// format/interests는 정규화된 값을 그대로 백엔드로 보낸다(Phase 2,
// subscribe.py가 저장) — ResultStep이 보여준 것과 동일한 값이어야
// "이 결과 그대로 저장" 약속이 실제로 지켜진다.
export function SubscribeStep({
  formatIndex,
  interests,
  onEdit,
  onSubscribed,
  onSkip,
  onBack,
}: {
  formatIndex: number;
  interests: string[];
  onEdit: () => void;
  onSubscribed: (email: string) => void;
  onSkip: () => void;
  onBack?: () => void;
}) {
  const p = lensPerspectiveAt(formatIndex);
  const Icon = p.icon;
  const copy = buildResultCopy(formatIndex, interests);
  const summaryLabel = [p.short, copy.tags.slice(1).join(', ')].filter(Boolean).join(' · ');

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: '#ffffff' }}>
      {/* 2026-09-03 — "지금은 넘어가기"였다가 "건너뛰기 →"로 통일. 이제
          모든 단계의 skip이 "전체 종료, 홈으로"라는 같은 뜻이라 라벨도
          맞춰야 사용자가 어디서든 같은 버튼=같은 동작이라고 믿을 수 있다. */}
      <OnboardingHeader currentStep={5} onSkip={onSkip} onBack={onBack} />

      <div style={{ padding: '28px 28px 0', textAlign: 'center' }}>
        <h1 style={{ margin: '0 0 26px', fontFamily: '"Noto Serif KR", serif', fontSize: 24, fontWeight: 700, lineHeight: 1.4, letterSpacing: '-0.02em', color: '#0f172a' }}>
          이 결과, 매일 아침
          <br />
          그대로 받아보실래요?
        </h1>
      </div>

      <div style={{ padding: '0 28px', maxWidth: 420, margin: '0 auto', width: '100%' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#f8fafc', borderRadius: 12, padding: '16px 18px', marginBottom: 22 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Icon size={18} color={p.color} strokeWidth={2} />
            <span style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>{summaryLabel}</span>
          </div>
          <button
            type="button"
            onClick={onEdit}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 12.5, fontWeight: 700, color: LENS_ACCENT, flexShrink: 0 }}
          >
            수정
          </button>
        </div>

        <NewsletterEmailField
          format={p.short}
          interests={normalizeInterests(interests)}
          onSuccess={({ email }) => onSubscribed(email)}
        />
      </div>
    </div>
  );
}
