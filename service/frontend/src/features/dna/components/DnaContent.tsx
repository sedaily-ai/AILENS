'use client';

import { useCountUp } from '@/features/news-feed';
import { MOCK_DNA_STATS } from '../data/mockDna';

// 이 화면의 강조색 — 단일 명의(AI LENS) 체계(2026-08-07) 이전엔 "내가 가장 많이
// 읽은 페르소나"의 accent color를 그대로 썼다("MY LENS — {에디터}의 시각으로
// 세상을 봐요" 카드). 4가지 시각 비율(MOCK_PERSPECTIVE_SHARE)이라는 개념 자체가
// 없어졌으므로 그 카드는 통째로 뺐고, 남은 누적 통계 카드는 브랜드 기본색 하나로.
const ACCENT = '#111827';

export function DnaContent() {
  const letters = useCountUp(MOCK_DNA_STATS.totalLetters);
  const minutes = useCountUp(MOCK_DNA_STATS.totalMinutes, 900, 250);
  const kws = useCountUp(MOCK_DNA_STATS.totalKeywords, 900, 500);

  return (
    <section style={{ maxWidth: 760, margin: '0 auto', padding: 'clamp(28px, 5vw, 56px) clamp(20px, 5vw, 32px)' }}>
      <header style={{ marginBottom: 28 }}>
        <p
          style={{
            fontSize: 11,
            letterSpacing: '0.14em',
            textTransform: 'uppercase',
            color: '#9ca3af',
            fontWeight: 600,
            marginBottom: 4,
          }}
        >
          Your DNA
        </p>
        <h1
          style={{
            fontFamily: '"Noto Serif KR", serif',
            fontSize: 'clamp(26px, 5.4vw, 32px)',
            fontWeight: 600,
            letterSpacing: '-0.025em',
            color: '#111827',
            lineHeight: 1.35,
          }}
        >
          당신의 시각, 데이터로 보면
        </h1>
        <p className="text-gray-500 mt-2" style={{ fontSize: 13.5, lineHeight: 1.6 }}>
          지금까지 쌓아온 읽기 패턴과 사고의 결을 모아봤어요.
        </p>
      </header>


      {/* 분석 콘텐츠 */}

      {/* 누적 */}
      <article
        style={{
          padding: 'clamp(24px, 5vw, 32px)',
          background: '#fdfcfb',
          borderRadius: 22,
          marginBottom: 24,
        }}
      >
        <p style={{ fontSize: 11, letterSpacing: '0.14em', textTransform: 'uppercase', color: '#9ca3af', fontWeight: 600, marginBottom: 16 }}>
          누적
        </p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
          {[
            { value: letters, label: '편의 글' },
            { value: minutes, label: '분의 사고' },
            { value: kws, label: '개의 단어' },
          ].map((s, i) => (
            <div key={i} style={{ textAlign: 'center' }}>
              <p style={{ fontFamily: '"Noto Serif KR", serif', fontSize: 'clamp(28px, 7vw, 38px)', fontWeight: 600, color: ACCENT, letterSpacing: '-0.03em', lineHeight: 1.05, fontVariantNumeric: 'tabular-nums' }}>
                {s.value}
              </p>
              <p style={{ fontSize: 12, color: '#6b7280', marginTop: 4, letterSpacing: '-0.005em' }}>
                {s.label}
              </p>
            </div>
          ))}
        </div>
      </article>

      {/* V1.5 단순화 — 키워드 TOP·시간 패턴·시각 비율은 백엔드 추적 필요해서 V2에. */}
    </section>
  );
}
