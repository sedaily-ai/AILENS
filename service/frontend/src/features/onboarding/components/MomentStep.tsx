'use client';

import { MomentArt } from './MomentArt';
import { trackEvent } from '@/shared/lib/tracking/trackEvent';
import { MOMENTS, MOMENT_MBTI, type Moment } from '../lib/moments';
import { OnboardingHeader } from './OnboardingHeader';

// 화면 1/2 — 질문 하나, 선택지 넷. 누르는 즉시 결과로 넘어간다(다음 버튼·복수 선택 없음).
// 건너뛰어도 되고 언제든 다시 올 수 있음을 질문 바로 아래에 밝혀 이탈 대신 "나중에"로 유도한다.
const BLUE = '#5b8def';

export function MomentStep({ onSelect, onSkip }: { onSelect: (moment: Moment) => void; onSkip: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: '#ffffff' }}>
      <style>{`
        .mm-card { transition: border-color .15s ease, background .15s ease, transform .1s ease; }
        .mm-card:hover { border-color: ${BLUE}; background: #f4f7fe; }
        .mm-card:active { transform: scale(.985); }
      `}</style>
      <OnboardingHeader hideProgress />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '8px 22px 32px', maxWidth: 440, margin: '0 auto', width: '100%' }}>
        <p style={{ margin: '0 0 8px', fontSize: 12.5, fontWeight: 600, color: '#9ca3af' }}>1 / 2</p>
        <h1 style={{ margin: 0, fontFamily: '"Noto Serif KR", serif', fontSize: 26, fontWeight: 700, lineHeight: 1.4, letterSpacing: '-0.02em', color: '#0f172a', wordBreak: 'keep-all' }}>
          뉴스, 주로 언제
          <br />
          보게 되나요?
        </h1>
        <p style={{ margin: '10px 0 20px', fontSize: 13.5, lineHeight: 1.6, color: '#6b7280', wordBreak: 'keep-all' }}>
          가장 가까운 하나만 눌러 주세요. 어려우면 나중에 해도 괜찮아요.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {MOMENTS.map((m) => (
            <button
              key={m.id}
              type="button"
              className="mm-card"
              onClick={() => {
                trackEvent('onboarding_moment_select', { moment: m.id, format: m.formatIndex });
                onSelect(m);
              }}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                width: '100%',
                padding: '14px 16px 14px 12px',
                textAlign: 'left',
                cursor: 'pointer',
                borderRadius: 16,
                border: '1px solid #e5e7eb',
                background: '#ffffff',
                boxShadow: '0 1px 2px rgba(15,23,42,.04)',
              }}
            >
              <MomentArt id={m.id} size={112} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 15, fontWeight: 700, color: '#0f172a', letterSpacing: '-0.01em' }}>{m.tag}</span>
                <span style={{ display: 'block', marginTop: 4, fontSize: 12.5, lineHeight: 1.55, color: '#6b7280', wordBreak: 'keep-all' }}>{m.scene}</span>
                <span style={{ display: 'flex', gap: 5, alignItems: 'center', marginTop: 7, fontSize: 11, color: '#a0a8b5' }}>
                  예를 들면
                  {MOMENT_MBTI[m.id].map((x) => (
                    <span key={x} style={{ padding: '1px 7px', borderRadius: 999, background: '#f1f5f9', color: '#64748b', fontWeight: 700, letterSpacing: '0.02em' }}>
                      {x}
                    </span>
                  ))}
                </span>
              </span>
            </button>
          ))}
        </div>

        {/* "나중에 할게요" — 선택지 바로 아래에 눈에 띄는 크기로 둔다. */}
        <button
          type="button"
          onClick={onSkip}
          style={{ alignSelf: 'center', marginTop: 22, padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, fontWeight: 600, color: '#6b7280' }}
        >
          나중에 할게요
        </button>
      </div>
    </div>
  );
}
