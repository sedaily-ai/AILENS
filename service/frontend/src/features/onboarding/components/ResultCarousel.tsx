'use client';

import { useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { trackEvent } from '@/shared/lib/tracking/trackEvent';
import { glanceShare, SITUATION_SHARE } from '../lib/distribution';
import type { Glance, Moment } from '../lib/moments';
import type { Persona } from '../lib/personas';
import { DistributionCard } from './DistributionCard';

// 결과의 "유형" 부분 — 설문 2개에 맞춰 큰 탭 2개로 나누고, 각 탭 안에서 카드를 화살표·스와이프로 넘긴다.
//   [보는 시간]  ① 이 시간대 비중  ② 시간대별 성향 분포
//   [먼저 보는 것]  ① 먼저 보는 방식의 비중  ② 성향 분포
// 조합 결과(유형 이름·하루 한 장면·MBTI 예시)는 탭 위에 고정해 어떤 포맷을 보고 있든 항상 보인다.
const BLUE = '#5b8def';

type Part = 'time' | 'timeTemper' | 'glance' | 'temper';
const TABS: { name: string; parts: Part[] }[] = [
  { name: '보는 시간', parts: ['time', 'timeTemper'] },
  { name: '먼저 보는 것', parts: ['glance', 'temper'] },
];

export function ResultCarousel({
  moment,
  glance,
  persona,
  title,
  line,
}: {
  moment: Moment;
  glance: Glance;
  persona: Persona | undefined;
  title: string;
  line: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(true); // 기본은 펼침. 접으면 한 줄 요약만 남는다.
  const [tab, setTab] = useState(0);
  const [idx, setIdx] = useState(0);
  const parts = TABS[tab].parts;

  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    const i = Math.round(el.scrollLeft / el.clientWidth);
    if (i !== idx) {
      setIdx(i);
      trackEvent('onboarding_result_slide', { moment: moment.id, glance: glance.id, tab, slide: i });
    }
  };
  const go = (i: number) => {
    const el = ref.current;
    if (!el) return;
    el.scrollTo({ left: Math.max(0, Math.min(parts.length - 1, i)) * el.clientWidth, behavior: 'smooth' });
  };
  const pickTab = (t: number) => {
    if (t === tab) return;
    setTab(t);
    setIdx(0);
    ref.current?.scrollTo({ left: 0 });
    trackEvent('onboarding_result_tab', { moment: moment.id, glance: glance.id, tab: t });
  };
  const arrow = (disabled: boolean): React.CSSProperties => ({ width: 30, height: 30, borderRadius: '50%', border: 'none', background: '#f1f5f9', color: '#475569', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.35 : 1, display: 'flex', alignItems: 'center', justifyContent: 'center' });

  return (
    <div style={{ maxWidth: 440, margin: '0 auto', width: '100%' }}>
      <style>{`
        .rc-track { display: flex; overflow-x: auto; scroll-snap-type: x mandatory; scrollbar-width: none; -webkit-overflow-scrolling: touch; }
        .rc-track::-webkit-scrollbar { display: none; }
        .rc-slide { flex: 0 0 100%; scroll-snap-align: center; box-sizing: border-box; padding: 0 2px; }
        .rc-tab { transition: background .15s ease, color .15s ease, border-color .15s ease; }
        .rc-arrow:hover:not(:disabled) { background: #e9edf3; }
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
          <b style={{ color: BLUE, fontWeight: 700 }}>{SITUATION_SHARE[moment.id]}%</b>가 이 시간에, <b style={{ color: BLUE, fontWeight: 700 }}>{glanceShare(glance.id)}%</b>가 나처럼 봐요
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

      <div ref={ref} key={tab} className="rc-track" onScroll={onScroll} style={{ marginTop: 12 }}>
        {parts.map((part) => (
          <div key={part} className="rc-slide">
            <DistributionCard moment={moment} glance={glance} part={part} />
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 14, marginTop: 12 }}>
        <button type="button" className="rc-arrow" aria-label="이전 카드" disabled={idx === 0} onClick={() => go(idx - 1)} style={arrow(idx === 0)}>
          <ChevronLeft size={17} strokeWidth={2.4} />
        </button>
        <div style={{ display: 'flex', gap: 6 }} aria-hidden>
          {parts.map((_, i) => (
            <span key={i} style={{ width: i === idx ? 18 : 6, height: 6, borderRadius: 3, background: i === idx ? BLUE : '#d5dbe6', transition: 'width .2s ease, background .2s ease' }} />
          ))}
        </div>
        <button type="button" className="rc-arrow" aria-label="다음 카드" disabled={idx === parts.length - 1} onClick={() => go(idx + 1)} style={arrow(idx === parts.length - 1)}>
          <ChevronRight size={17} strokeWidth={2.4} />
        </button>
      </div>
      </div>
    </div>
  );
}
