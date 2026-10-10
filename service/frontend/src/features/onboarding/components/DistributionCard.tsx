'use client';

import { DISTRIBUTION_IS_MOCK, SITUATION_SHARE, TEMPERAMENT_BY_GLANCE, TEMPERAMENT_BY_SITUATION, TEMPERAMENTS, glanceShare, type Temperament } from '../lib/distribution';
import { GLANCES, MOMENTS, type Glance, type Moment } from '../lib/moments';
import { GlanceArt } from './GlanceArt';
import { MomentArt } from './MomentArt';

// 결과 화면 — 나와 같은 유형이 얼마나 되는지, 다른 사람들은 이 상황에서 무엇부터 보는지 보여 준다.
// 읽는 순서: ① 한 줄 결론(같은 유형 N%) → ② 이 상황에서 사람들이 먼저 보는 것(막대 4개, 내 것 강조) → ③ 나와 같은 선택을 한 사람들의 성향.
// 일반 독자가 모르는 약어(NT·NF·ST·SF)는 풀어 쓴 이름을 앞에 두고 약어는 작게 곁들인다.
// 막대는 마운트 시 자란다(CSS 애니메이션). 수치는 lib/distribution.ts(현재 샘플)에서 온다.
const BLUE = '#5b8def';

/** 막대 이름 — "글부터"처럼 "무엇을 먼저 보는지"가 바로 읽히게. */
const FIRST: Record<string, string> = { text: '글부터', comic: '그림부터', sound: '소리부터', video: '영상부터' };

/** 기질 이름 — MBTI 앞 두 글자(인식·판단 성향)를 일반인이 읽을 수 있는 말로 옮긴 표기. */
const TEMPER_NAME: Record<Temperament, string> = { NT: '분석형', NF: '감성형', ST: '현실형', SF: '배려형' };
/** 성향별 막대 색 — 서로 구분되되 튀지 않는 차분한 톤. */
const TEMPER_COLOR: Record<Temperament, string> = { NT: '#5b8def', NF: '#e9967a', ST: '#6dbd9e', SF: '#a99be8' };

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

const topOf = (d: Record<Temperament, number>): Temperament => TEMPERAMENTS.reduce((a, b) => (d[b] > d[a] ? b : a), TEMPERAMENTS[0]);

/** 성향 분포 — 범례 + 행마다 100%인 가로 누적 막대. 내 행은 파란 테두리로 강조한다. */
function StackedRows({ title, sub, rows }: { title: string; sub: string; rows: { id: string; label: string; data: Record<Temperament, number>; mine: boolean }[] }) {
  return (
    <>
      <p style={{ margin: '0 0 3px', fontSize: 12.5, fontWeight: 700, color: '#374151' }}>{title}</p>
      <p style={{ margin: '0 0 10px', fontSize: 12, color: '#8b95a5', wordBreak: 'keep-all' }}>{sub}</p>
      <div role="list" aria-label="범례" style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 12px', marginBottom: 12 }}>
        {TEMPERAMENTS.map((k) => (
          <span key={k} role="listitem" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#4b5563' }}>
            <span aria-hidden style={{ width: 10, height: 10, borderRadius: 3, background: TEMPER_COLOR[k] }} />
            {TEMPER_NAME[k]}
            <span style={{ color: '#a0a8b5', fontSize: 11 }}>{k}</span>
          </span>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
        {rows.map((r, i) => (
          <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 60, fontSize: 12.5, fontWeight: r.mine ? 700 : 500, color: r.mine ? '#0f172a' : '#6b7280' }}>{r.label}</span>
            <span className="dc-bar" style={{ flex: 1, display: 'flex', height: 22, borderRadius: 6, overflow: 'hidden', outline: r.mine ? `1.5px solid ${BLUE}` : 'none', outlineOffset: 1.5, animationDelay: `${i * 0.06}s` }}>
              {TEMPERAMENTS.map((k) => (
                <span key={k} title={`${TEMPER_NAME[k]} ${r.data[k]}%`} style={{ width: `${r.data[k]}%`, background: TEMPER_COLOR[k], color: '#fff', fontSize: 10.5, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: r.mine ? 1 : 0.78 }}>
                  {r.data[k] >= 14 ? r.data[k] : ''}
                </span>
              ))}
            </span>
          </div>
        ))}
      </div>
      <p style={{ margin: '10px 0 0', fontSize: 11, color: '#a0a8b5', wordBreak: 'keep-all' }}>막대 하나가 100%예요. 숫자는 각 성향이 차지하는 비율이에요.</p>
    </>
  );
}

export function DistributionCard({ moment, glance, part }: { moment: Moment; glance: Glance; part: 'time' | 'timeTemper' | 'glance' | 'temper' }) {
  const temper = TEMPERAMENT_BY_GLANCE[glance.id];
  const maxT = Math.max(...TEMPERAMENTS.map((x) => temper[x]));
  const topT = TEMPERAMENTS.find((x) => temper[x] === maxT) as Temperament;
  return (
    <section aria-label="다른 분들의 선택" style={{ height: '100%', boxSizing: 'border-box', padding: '18px 18px 16px', borderRadius: 18, background: '#f8fafc', border: '1px solid #eef1f6', textAlign: 'left' }}>
      <style>{`
        @keyframes dc-grow { from { transform: scaleX(0); } to { transform: scaleX(1); } }
                .dc-bar { transform-origin: left center; animation: dc-grow .7s cubic-bezier(.22,.8,.22,1) both; }
        @media (prefers-reduced-motion: reduce) { .dc-bar { animation: none; } }
      `}</style>

      {part === 'time' && (
        <>
          {/* 1단계 답: 어떤 시간에 뉴스를 보는지 */}
          <Head art={<MomentArt id={moment.id} size={84} />} kicker={DISTRIBUTION_IS_MOCK ? '예시 · 전체 중' : '전체 중'} big={`${SITUATION_SHARE[moment.id]}%`} tail="가 이 시간에 뉴스를 봐요" />
          <p style={{ margin: '14px 0 9px', fontSize: 12.5, fontWeight: 700, color: '#374151' }}>다들 언제 뉴스를 볼까요</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {MOMENTS.map((m, i) => (
              <Bar key={m.id} label={m.short} value={SITUATION_SHARE[m.id]} mine={m.id === moment.id} delay={i * 0.06} />
            ))}
          </div>
                  </>
      )}

      {part === 'glance' && (
        <>
          {/* 2단계 답: 무엇이 먼저 눈에 들어오는지 */}
          <Head art={<GlanceArt id={glance.id} size={96} />} kicker={DISTRIBUTION_IS_MOCK ? '예시 · 전체 중' : '전체 중'} big={`${glanceShare(glance.id)}%`} tail={`가 나처럼 ${FIRST[glance.id]} 봐요`} />
          <p style={{ margin: '14px 0 9px', fontSize: 12.5, fontWeight: 700, color: '#374151' }}>다들 무엇부터 볼까요</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {GLANCES.map((g, i) => (
              <Bar key={g.id} label={FIRST[g.id]} value={glanceShare(g.id)} mine={g.id === glance.id} delay={i * 0.06} />
            ))}
          </div>
                  </>
      )}

      {part === 'timeTemper' && (
        <>
          <StackedRows
            title="보는 시간에 따라 성향이 이렇게 나뉘어요"
            sub={`${moment.short}에 뉴스를 보는 분들은 ${TEMPER_NAME[topOf(TEMPERAMENT_BY_SITUATION[moment.id])]}(${topOf(TEMPERAMENT_BY_SITUATION[moment.id])})이 ${TEMPERAMENT_BY_SITUATION[moment.id][topOf(TEMPERAMENT_BY_SITUATION[moment.id])]}%로 가장 많아요`}
            rows={MOMENTS.map((m) => ({ id: m.id, label: m.short, data: TEMPERAMENT_BY_SITUATION[m.id], mine: m.id === moment.id }))}
          />
        </>
      )}

      {part === 'temper' && (
        <>
          <StackedRows
            title="보는 방식에 따라 성향이 이렇게 나뉘어요"
            sub={`${FIRST[glance.id]} 보는 분들은 ${TEMPER_NAME[topT]}(${topT})이 ${maxT}%로 가장 많아요`}
            rows={GLANCES.map((g) => ({ id: g.id, label: FIRST[g.id], data: TEMPERAMENT_BY_GLANCE[g.id], mine: g.id === glance.id }))}
          />
        </>
      )}

      {DISTRIBUTION_IS_MOCK && (
        <p style={{ margin: '12px 0 0', fontSize: 11, fontWeight: 600, color: '#b45309', wordBreak: 'keep-all' }}>※ 예시 수치예요. 실제 이용자 집계가 아니에요.</p>
      )}
    </section>
  );
}
