'use client';

import { useEffect, useRef } from 'react';
import { lensPerspectiveAt, LENS_FORMATS } from '@/shared/constants/lensPerspectives';
import type { CmsLens } from '@/shared/lib/api/cmsPostsApi';

const AUTO_ADVANCE_MS = 5000;
const DEFAULT_FORMAT_INDEX = 0; // 레터

// STEP 2 — 오늘의 1면 기사를 어떤 포맷으로 볼지 고른다. 5초 안에 안 고르면
// 기본값(레터)으로 자동 진행 — 막다른 화면을 만들지 않는다는 원칙.
export function FormatStep({
  lens,
  onSelect,
  onSkip,
}: {
  lens: CmsLens | null;
  onSelect: (index: number) => void;
  onSkip: () => void;
}) {
  const onSelectRef = useRef(onSelect);
  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  useEffect(() => {
    const t = setTimeout(() => onSelectRef.current(DEFAULT_FORMAT_INDEX), AUTO_ADVANCE_MS);
    return () => clearTimeout(t);
  }, []);

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

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '8px 24px', textAlign: 'center', gap: 14, maxWidth: 440, margin: '0 auto', width: '100%' }}>
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

      <div style={{ textAlign: 'center', padding: '0 0 28px' }}>
        <p style={{ margin: 0, fontSize: 11, color: '#9ca3af' }}>5초 후 레터로 자동 진행</p>
      </div>
    </div>
  );
}
