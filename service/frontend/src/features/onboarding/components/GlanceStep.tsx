'use client';

import { trackEvent } from '@/shared/lib/tracking/trackEvent';
import { GLANCES, GLANCE_MBTI, type Glance, type Moment } from '../lib/moments';
import { GlanceArt } from './GlanceArt';
import { OnboardingHeader } from './OnboardingHeader';

// 질문 2 — "그때 뉴스를 열면, 가장 먼저 눈이 가는 건?" 같은 상황에서도 눈이 먼저 가는 곳은 사람마다 다르다(인지 유형).
// 질문 1과 같은 규칙으로 한 번 누르면 바로 다음으로 넘어가며, 선택지는 작은 그림 + 이름 + 한 줄로 구성한다.
const BLUE = '#5b8def';

export function GlanceStep({ moment, onSelect, onBack, onSkip }: { moment: Moment; onSelect: (glance: Glance) => void; onBack: () => void; onSkip: () => void }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: '#ffffff' }}>
      <style>{`
        .gl-card { transition: border-color .15s ease, background .15s ease, transform .1s ease; }
        .gl-card:hover { border-color: ${BLUE}; background: #f4f7fe; }
        .gl-card:active { transform: scale(.985); }
      `}</style>
      <OnboardingHeader hideProgress onBack={onBack} />

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', padding: '8px 22px 32px', maxWidth: 440, margin: '0 auto', width: '100%' }}>
        <p style={{ margin: '0 0 8px', fontSize: 12.5, fontWeight: 600, color: '#9ca3af' }}>2 / 2 · {moment.tag}</p>
        <h1 style={{ margin: 0, fontFamily: '"Noto Serif KR", serif', fontSize: 26, fontWeight: 700, lineHeight: 1.4, letterSpacing: '-0.02em', color: '#0f172a', wordBreak: 'keep-all' }}>
          그때 뉴스를 열면,
          <br />
          무엇이 먼저 보이나요?
        </h1>
        <p style={{ margin: '10px 0 20px', fontSize: 13.5, lineHeight: 1.6, color: '#6b7280', wordBreak: 'keep-all' }}>
          눈이 가장 먼저 가는 하나만 눌러 주세요. 정답은 없어요.
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {GLANCES.map((g) => (
            <button
              key={g.id}
              type="button"
              className="gl-card"
              onClick={() => {
                trackEvent('onboarding_glance_select', { moment: moment.id, glance: g.id });
                onSelect(g);
              }}
              style={{ display: 'flex', alignItems: 'center', gap: 14, width: '100%', padding: '14px 16px 14px 12px', textAlign: 'left', cursor: 'pointer', borderRadius: 16, border: '1px solid #e5e7eb', background: '#ffffff', boxShadow: '0 1px 2px rgba(15,23,42,.04)' }}
            >
              <GlanceArt id={g.id} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 15, fontWeight: 700, color: '#0f172a', letterSpacing: '-0.01em' }}>{g.label}</span>
                <span style={{ display: 'block', marginTop: 4, fontSize: 12.5, lineHeight: 1.55, color: '#6b7280', wordBreak: 'keep-all' }}>{g.hint}</span>
                <span style={{ display: 'flex', gap: 5, alignItems: 'center', marginTop: 7, fontSize: 11, color: '#a0a8b5' }}>
                  예를 들면
                  {GLANCE_MBTI[g.id].map((x) => (
                    <span key={x} style={{ padding: '1px 7px', borderRadius: 999, background: '#f1f5f9', color: '#64748b', fontWeight: 700, letterSpacing: '0.02em' }}>
                      {x}
                    </span>
                  ))}
                </span>
              </span>
            </button>
          ))}
        </div>

        <button type="button" onClick={onSkip} style={{ alignSelf: 'center', marginTop: 22, padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, fontWeight: 600, color: '#6b7280' }}>
          나중에 할게요
        </button>
      </div>
    </div>
  );
}
