'use client';

import type { Shares } from '../lib/distribution';
import { GLANCES, MOMENTS, type Glance, type Moment } from '../lib/moments';
import { GlanceArt } from './GlanceArt';
import { MomentArt } from './MomentArt';

// 결과 화면 — 나와 같은 선택이 얼마나 되는지, 다른 사람들은 언제·무엇부터 보는지 보여 준다.
// 읽는 순서: ① 한 줄 결론(같은 선택 N%) → ② 막대 4개(내 것 강조).
// 막대는 마운트 시 자란다(CSS 애니메이션). 수치는 서버 집계(lib/distribution.ts toShares)에서 온다.
const BLUE = '#5b8def';

/** 막대 이름 — "글부터"처럼 "무엇을 먼저 보는지"가 바로 읽히게. */
const FIRST: Record<string, string> = { text: '글부터', comic: '그림부터', sound: '소리부터', video: '영상부터' };

/** 카드 맨 위 — 작은 그림 + 이름 + 큰 퍼센트 한 줄 결론. */
function Head({ art, kicker, big, tail }: { art: React.ReactNode; kicker: string; big: string; tail: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{ flexShrink: 0 }}>{art}</div>
      <div style={{ minWidth: 0 }}>
        <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: '#9ca3af' }}>{kicker}</p>
        <p style={{ margin: '2px 0 0', display: 'flex', alignItems: 'baseline', gap: 3, flexWrap: 'wrap' }}>
          <span style={{ fontFamily: '"Noto Serif KR", serif', fontSize: 30, fontWeight: 700, color: BLUE, letterSpacing: '-0.02em' }}>{big}</span>
          <span style={{ fontSize: 13, color: '#4b5563', wordBreak: 'keep-all' }}>{tail}</span>
        </p>
      </div>
    </div>
  );
}

/** 가로 막대 한 줄 — 내가 고른 것은 파랗게 + "· 나". */
function Bar({ label, value, mine, delay }: { label: string; value: number; mine: boolean; delay: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <span style={{ width: 60, fontSize: 12.5, fontWeight: mine ? 700 : 500, color: mine ? '#0f172a' : '#6b7280' }}>{label}</span>
      <span style={{ flex: 1, height: 9, borderRadius: 5, background: '#e8edf5', overflow: 'hidden' }}>
        <span className="dc-bar" style={{ display: 'block', width: `${value}%`, height: '100%', borderRadius: 5, background: mine ? BLUE : '#b8c6e4', animationDelay: `${delay}s` }} />
      </span>
      <span style={{ width: 54, fontSize: 12.5, fontWeight: mine ? 700 : 500, color: mine ? BLUE : '#8b95a5', textAlign: 'right' }}>
        {value}%{mine ? ' · 나' : ''}
      </span>
    </div>
  );
}

export function DistributionCard({ moment, glance, part, shares }: { moment: Moment; glance: Glance; part: 'time' | 'glance'; shares: Shares }) {
  return (
    <section aria-label="다른 분들의 선택" style={{ boxSizing: 'border-box', padding: '18px 18px 16px', borderRadius: 18, background: '#f8fafc', border: '1px solid #eef1f6', textAlign: 'left' }}>
      <style>{`
        @keyframes dc-grow { from { transform: scaleX(0); } to { transform: scaleX(1); } }
        .dc-bar { transform-origin: left center; animation: dc-grow .7s cubic-bezier(.22,.8,.22,1) both; }
        @media (prefers-reduced-motion: reduce) { .dc-bar { animation: none; } }
      `}</style>

      {part === 'time' && (
        <>
          {/* 1단계 답: 어떤 시간에 뉴스를 보는지 */}
          <Head art={<MomentArt id={moment.id} size={84} />} kicker="전체 중" big={`${shares.situation[moment.id]}%`} tail="가 이 시간에 뉴스를 봐요" />
          <p style={{ margin: '14px 0 9px', fontSize: 12.5, fontWeight: 700, color: '#374151' }}>다들 언제 뉴스를 볼까요</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {MOMENTS.map((m, i) => (
              <Bar key={m.id} label={m.short} value={shares.situation[m.id]} mine={m.id === moment.id} delay={i * 0.06} />
            ))}
          </div>
        </>
      )}

      {part === 'glance' && (
        <>
          {/* 2단계 답: 무엇이 먼저 눈에 들어오는지 */}
          <Head art={<GlanceArt id={glance.id} size={96} />} kicker="전체 중" big={`${shares.glance[glance.id]}%`} tail={`가 나처럼 ${FIRST[glance.id]} 봐요`} />
          <p style={{ margin: '14px 0 9px', fontSize: 12.5, fontWeight: 700, color: '#374151' }}>다들 무엇부터 볼까요</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {GLANCES.map((g, i) => (
              <Bar key={g.id} label={FIRST[g.id]} value={shares.glance[g.id]} mine={g.id === glance.id} delay={i * 0.06} />
            ))}
          </div>
        </>
      )}
    </section>
  );
}
