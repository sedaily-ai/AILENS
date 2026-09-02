'use client';

import { useState } from 'react';

// STEP 4 — 관심 분야. "지면 특별 코너" taxonomy(LensPreviewSection.tsx의
// SECTIONS)와 동일한 4개 값. "전체"는 나머지 3개와 배타적(라디오처럼) —
// 정규화 규칙(resultCopy.ts의 normalizeInterests)이 이 배타성을 전제로 한다.
const CATEGORIES = ['전체', '증권', '산업', '시그널'];

export function InterestStep({
  initialSelected,
  onContinue,
  onSkip,
}: {
  initialSelected: string[];
  onContinue: (selected: string[]) => void;
  onSkip: () => void;
}) {
  const [selected, setSelected] = useState<string[]>(initialSelected);

  const toggle = (cat: string) => {
    setSelected((prev) => {
      if (cat === '전체') return prev.includes('전체') ? [] : ['전체'];
      const withoutAll = prev.filter((c) => c !== '전체');
      return withoutAll.includes(cat) ? withoutAll.filter((c) => c !== cat) : [...withoutAll, cat];
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100dvh', background: '#ffffff' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '26px 0 0' }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#3182F6' }} />
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#e5e7eb' }} />
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '0 30px', textAlign: 'center', gap: 12 }}>
        <p style={{ margin: 0, fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.22em', textTransform: 'uppercase' }}>
          관심 분야
        </p>
        <h1 style={{ margin: 0, fontFamily: '"Noto Serif KR", serif', fontSize: 24, fontWeight: 700, lineHeight: 1.4, letterSpacing: '-0.02em', color: '#0f172a' }}>
          특히 관심 있는
          <br />
          분야가 있으신가요?
        </h1>
        <p style={{ margin: '0 0 10px', fontSize: 13, color: '#6b7280' }}>여러 개 골라도 좋아요</p>

        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 10 }}>
          {CATEGORIES.map((cat) => {
            const on = selected.includes(cat);
            return (
              <button
                key={cat}
                type="button"
                onClick={() => toggle(cat)}
                aria-pressed={on}
                style={{
                  padding: '10px 18px',
                  borderRadius: 999,
                  background: on ? '#3182F6' : '#ffffff',
                  border: `1px solid ${on ? '#3182F6' : '#e5e7eb'}`,
                  fontSize: 14,
                  fontWeight: on ? 700 : 600,
                  color: on ? '#ffffff' : '#475569',
                  cursor: 'pointer',
                }}
              >
                {cat}
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px 26px', borderTop: '1px solid #f1f5f9' }}>
        <button
          type="button"
          onClick={onSkip}
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', fontSize: 13.5, fontWeight: 600, color: '#94a3b8' }}
        >
          건너뛰기
        </button>
        <button
          type="button"
          onClick={() => onContinue(selected)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '12px 22px', borderRadius: 12, background: '#0f172a', border: 'none', color: '#ffffff', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
        >
          다음 →
        </button>
      </div>
    </div>
  );
}
