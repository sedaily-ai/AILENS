'use client';

import { lensPerspectiveAt } from '@/shared/constants/lensPerspectives';
import { buildResultCopy } from '../lib/resultCopy';

// STEP 5 — 결과 리빌. 이 플로우의 핵심 순간(설정이 아니라 "나를 발견"하는
// 경험으로 만드는 화면) — resultCopy.ts의 공식으로 포맷×관심분야 조합을
// 전부 커버한다.
export function ResultStep({
  formatIndex,
  interests,
  onContinue,
}: {
  formatIndex: number;
  interests: string[];
  onContinue: () => void;
}) {
  const p = lensPerspectiveAt(formatIndex);
  const Icon = p.icon;
  const copy = buildResultCopy(formatIndex, interests);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100dvh',
        background: `radial-gradient(ellipse 60% 50% at 50% 0%, ${p.tint} 0%, transparent 70%), #ffffff`,
      }}
    >
      <div style={{ padding: '22px 22px 0' }}>
        <span style={{ fontFamily: '"Noto Serif KR", serif', fontSize: 13, fontWeight: 700, color: '#0f172a' }}>
          AI LENS
        </span>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 26px', gap: 20, maxWidth: 420, margin: '0 auto', width: '100%' }}>
        <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.22em', textTransform: 'uppercase' }}>
          당신의 유형
        </p>

        <div
          style={{
            width: '100%',
            background: '#ffffff',
            borderRadius: 20,
            padding: '32px 26px',
            boxShadow: `0 20px 48px ${p.color}24`,
            border: '1px solid rgba(0,0,0,0.04)',
            textAlign: 'center',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 16,
          }}
        >
          <div style={{ width: 52, height: 52, borderRadius: '50%', background: p.tint, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Icon size={24} color={p.color} strokeWidth={2} />
          </div>

          <h1 style={{ margin: 0, fontFamily: '"Noto Serif KR", serif', fontSize: 22, fontWeight: 700, lineHeight: 1.4, letterSpacing: '-0.02em', color: '#0f172a' }}>
            {copy.headlineLines[0]}
            <br />
            {copy.headlineLines[1]}
          </h1>

          <p style={{ margin: 0, fontSize: 13.5, lineHeight: 1.7, color: '#6b7280' }}>{copy.description}</p>

          <div style={{ display: 'flex', gap: 8, marginTop: 4, flexWrap: 'wrap', justifyContent: 'center' }}>
            {copy.tags.map((tag, idx) => (
              <span
                key={tag}
                style={{
                  padding: '6px 12px',
                  borderRadius: 999,
                  background: idx === 0 ? p.tint : '#eff6ff',
                  color: idx === 0 ? p.color : '#3182F6',
                  fontSize: 11.5,
                  fontWeight: 700,
                }}
              >
                {tag}
              </span>
            ))}
          </div>
        </div>

        <button
          type="button"
          onClick={onContinue}
          style={{ width: '100%', textAlign: 'center', padding: 14, borderRadius: 12, background: '#0f172a', border: 'none', color: '#ffffff', fontSize: 14.5, fontWeight: 700, cursor: 'pointer' }}
        >
          이 결과 저장하기 →
        </button>
        <p style={{ margin: '-6px 0 0', fontSize: 11.5, color: '#9ca3af' }}>저장 안 해도 오늘은 계속 볼 수 있어요</p>
      </div>

      <div style={{ height: 28 }} />
    </div>
  );
}
