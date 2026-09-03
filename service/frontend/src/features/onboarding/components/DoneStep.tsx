'use client';

import Link from 'next/link';
import { Check } from 'lucide-react';
import type { CmsLens } from '@/shared/lib/api/cmsPostsApi';
import { lensPerspectiveAt } from '@/shared/constants/lensPerspectives';
import { onboardingPrimaryButtonStyle } from '../lib/onboardingButton';
import { OnboardingHeader } from './OnboardingHeader';

// STEP 7 — 마무리. 와이어프레임의 "몇 시에 받아보고 싶으세요?" 시간 피커는
// 뺐다 — frontpage_auto(07:00 KST 고정)/mustknow_auto(08/12/15/18/21/23시
// 고정 배치) 둘 다 유저별 임의 발송 시각을 지원하지 않아서, 시간 선택 UI를
// 넣으면 지키지 못할 약속이 된다. 대신 확인 + 바로 보기 CTA만 남긴다.
export function DoneStep({
  lens,
  formatIndex,
  subscribed,
}: {
  lens: CmsLens | null;
  formatIndex: number;
  subscribed: boolean;
}) {
  const href = lens ? `/lens/${encodeURIComponent(lens.id)}?v=${formatIndex + 1}` : '/';
  const p = lensPerspectiveAt(formatIndex);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: '#ffffff' }}>
      <OnboardingHeader currentStep={7} />

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '28px 0 0' }}>
        {subscribed && (
          <>
            <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#e6f4ef', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Check size={17} color="#059669" strokeWidth={3} />
            </div>
            <p style={{ margin: 0, fontSize: 12, fontWeight: 700, color: '#059669' }}>구독 완료</p>
          </>
        )}
      </div>

      <div style={{ padding: '22px 28px 0', textAlign: 'center' }}>
        <h1 style={{ margin: 0, fontFamily: '"Noto Serif KR", serif', fontSize: 24, fontWeight: 700, lineHeight: 1.4, letterSpacing: '-0.02em', color: '#0f172a' }}>
          {subscribed ? (
            <>
              내일 아침부터
              <br />
              메일함으로 갈게요
            </>
          ) : (
            <>
              오늘은 여기까지
              <br />
              둘러보실게요
            </>
          )}
        </h1>
        <p style={{ margin: '10px 0 0', fontSize: 13, color: '#6b7280' }}>
          {subscribed ? '스팸함도 한 번 확인해주세요' : '언제든 메인에서 다시 시작할 수 있어요'}
        </p>
      </div>

      <div style={{ flex: 1 }} />

      <div style={{ padding: '0 28px 14px', maxWidth: 420, margin: '0 auto', width: '100%' }}>
        <Link href={href} style={onboardingPrimaryButtonStyle(p.color)}>
          오늘 것부터 먼저 보기 →
        </Link>
      </div>
    </div>
  );
}
