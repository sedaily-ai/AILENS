'use client';

import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { trackEvent } from '@/shared/lib/tracking/trackEvent';
import type { Shares } from '../lib/distribution';
import type { Glance, Moment } from '../lib/moments';
import type { Persona } from '../lib/personas';
import { DistributionCard } from './DistributionCard';

// 결과의 "유형" 부분 — 설문 2개에 맞춰 큰 탭 2개로 나누고, 탭마다 실제 집계 카드 1장을 보여 준다.
//   [보는 시간] 이 시간대 비중  [먼저 보는 것] 먼저 보는 방식의 비중
// MBTI 성향 분포는 온보딩이 MBTI를 묻지 않아 실제로 집계할 수 없으므로 두지 않는다.
// 집계가 없으면(표본 부족·요청 실패) 통계 영역 전체를 숨긴다.
// 조합 결과(유형 이름·하루 한 장면·MBTI 예시)는 탭 위에 고정해 어떤 포맷을 보고 있든 항상 보인다.
const BLUE = '#5b8def';

const TABS: { name: string; part: 'time' | 'glance' }[] = [
  { name: '보는 시간', part: 'time' },
  { name: '먼저 보는 것', part: 'glance' },
];

export function ResultCarousel({
  moment,
  glance,
  persona,
  title,
  line,
  shares,
}: {
  moment: Moment;
  glance: Glance;
  persona: Persona | undefined;
  title: string;
  line: string;
  shares: Shares | null;
}) {
  const [open, setOpen] = useState(true); // 기본은 펼침. 접으면 한 줄 요약만 남는다.
  const [tab, setTab] = useState(0);

  const pickTab = (t: number) => {
    if (t === tab) return;
    setTab(t);
    trackEvent('onboarding_result_tab', { moment: moment.id, glance: glance.id, tab: t });
  };

  return (
    <div style={{ maxWidth: 440, margin: '0 auto', width: '100%' }}>
      <style>{`
        .rc-tab { transition: background .15s ease, color .15s ease, border-color .15s ease; }
      `}</style>

      {/* 조합 결과 — 항상 보인다 */}
      <p style={{ margin: '4px 0 0', fontSize: 12.5, fontWeight: 600, color: '#9ca3af' }}>{moment.tag}</p>
      <h1 style={{ margin: '4px 0 0', fontFamily: '"Noto Serif KR", serif', fontSize: 28, fontWeight: 700, letterSpacing: '-0.02em', color: '#0f172a' }}>{title}</h1>
      {persona ? (
        <>
          {/* 페르소나: 그 사람의 하루 한 장면 → MBTI는 "이런 성향이라면"이라는 예시로만 → 마지막에 어떤 포맷으로 보여 주는지 */}
          <p style={{ margin: '8px auto 0', fontSize: 14.5, lineHeight: 1.65, color: '#1f2937', wordBreak: 'keep-all' }}>{persona.life}</p>
          <p style={{ margin: '12px 0 0', display: 'flex', gap: 6, alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', fontSize: 12.5, color: '#8b95a5' }}>
            {persona.mbti.map((m) => (
              <span key={m} style={{ padding: '2px 8px', borderRadius: 999, background: '#f1f5f9', color: '#64748b', fontWeight: 700, letterSpacing: '0.02em' }}>
                {m}
              </span>
            ))}
            <span>같은 분들께 잘 맞아요</span>
          </p>
          <p style={{ margin: '14px 0 0', fontSize: 13, lineHeight: 1.65, color: '#4b5563', wordBreak: 'keep-all' }}>{line}</p>
        </>
      ) : (
        <p style={{ margin: '6px 0 0', fontSize: 13.5, lineHeight: 1.6, color: '#4b5563', wordBreak: 'keep-all' }}>{line}</p>
      )}

      {/* 통계는 기본으로 펼쳐져 있고, 접으면 한 줄 요약만 남는다(기사를 더 빨리 보고 싶은 사용자를 위해). */}
      {shares && (
        <>
          <button
            type="button"
            aria-expanded={open}
            onClick={() => {
              setOpen((v) => !v);
              trackEvent('onboarding_result_stats_toggle', { moment: moment.id, glance: glance.id, open: !open });
            }}
            style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', marginTop: 22, padding: '12px 14px', borderRadius: 14, border: '1px solid #e8edf5', background: '#f8fafc', cursor: 'pointer', textAlign: 'left' }}
          >
            <span style={{ flex: 1, minWidth: 0, fontSize: 13, lineHeight: 1.5, color: '#4b5563', wordBreak: 'keep-all' }}>
              <b style={{ color: BLUE, fontWeight: 700 }}>{shares.situation[moment.id]}%</b>가 이 시간에, <b style={{ color: BLUE, fontWeight: 700 }}>{shares.glance[glance.id]}%</b>가 나처럼 봐요
            </span>
            <span style={{ flexShrink: 0, fontSize: 12.5, fontWeight: 700, color: '#6b7280', display: 'flex', alignItems: 'center', gap: 2 }}>
              {open ? '접기' : '통계 보기'}
              <ChevronDown size={15} strokeWidth={2.4} style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s ease' }} />
            </span>
          </button>

          <div hidden={!open}>
            {/* 탭 2개 — 설문 2개에 1:1. 연한 트랙 위에 흰 알약이 올라가는 세그먼트 컨트롤(아래 포맷 칩과 모양이 겹치지 않게, 기사보다 눈을 덜 끌게). */}
            <div role="tablist" aria-label="결과 보기" style={{ display: 'flex', gap: 4, marginTop: 12, padding: 4, borderRadius: 14, background: '#f1f5f9' }}>
              {TABS.map((t, i) => (
                <button
                  key={t.name}
                  type="button"
                  role="tab"
                  aria-selected={i === tab}
                  className="rc-tab"
                  onClick={() => pickTab(i)}
                  style={{ flex: 1, padding: '10px 0', borderRadius: 11, border: 'none', cursor: 'pointer', fontSize: 14, fontWeight: 700, background: i === tab ? '#ffffff' : 'transparent', color: i === tab ? '#0f172a' : '#8b95a5', boxShadow: i === tab ? '0 1px 3px rgba(15,23,42,.12)' : 'none' }}
                >
                  {t.name}
                </button>
              ))}
            </div>

            <div key={tab} style={{ marginTop: 12 }}>
              <DistributionCard moment={moment} glance={glance} part={TABS[tab].part} shares={shares} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
