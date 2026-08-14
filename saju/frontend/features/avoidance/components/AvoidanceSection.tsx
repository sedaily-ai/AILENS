'use client';

import { useMemo } from 'react';
import { useLang } from '@saju/shared/lib/LangContext';
import type { Pillar } from '@saju/features/fortune/lib/engine';
import { computeAvoidance } from '../lib/avoidanceEngine';
import { ToggleSection } from '@saju/features/ideal-match/components/ToggleSection';
import { IncompatibleAnimalsSection } from './IncompatibleAnimalsSection';

const OH_EN: Record<string, string> = {
  '목': 'Wood', '화': 'Fire', '토': 'Earth', '금': 'Metal', '수': 'Water',
};

interface Props {
  pillars: Pillar[];
  birthYear?: number;
}

export function AvoidanceSection({ pillars, birthYear }: Props) {
  const { t, lang, localePath } = useLang();

  const result = useMemo(
    () => computeAvoidance(pillars, birthYear),
    [pillars, birthYear],
  );

  if (!result) return null;

  /** 텍스트에서 첫 문장(마침표·물음표·느낌표 기준)을 추출 */
  const firstLine = (text: string) => {
    const m = text.match(/^.+?[.?!。]\s?/);
    return m ? m[0].trim() : text.slice(0, 40) + '…';
  };

  const avoidOh = result.avoidStemOh[0];
  const avoidOhLabel = lang === 'en' ? OH_EN[avoidOh] ?? avoidOh : avoidOh;

  return (
    <>
      {/* 분석 방식 안내 */}
      <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-3 leading-snug px-1 italic">
        {t(
          '충·형·파·상극으로 분석한 나와 부딪히는 사주 유형입니다. 모든 관계는 노력으로 개선할 수 있으며, 참고 목적으로 가볍게 봐주세요.',
          'Analyzed via clash, punishment, break, and element opposition. All relationships can improve with effort — take this as entertainment only.'
        )}
      </p>

      {/* === 피해야 할 유형 === */}
      <div className="mb-4">
        <h2 className="text-[18px] font-extrabold text-gray-900 dark:text-gray-50 tracking-[-0.02em] mb-1.5">
          {t('피해야 할 유형', 'Type to Avoid')}
        </h2>
        <p className="text-[14px] text-gray-600 dark:text-gray-300 leading-[1.7]">
          {lang === 'en'
            ? `People with ${avoidOhLabel} energy may clash with you.`
            : result.summary}
        </p>
      </div>

      {/* === 안 맞는 동물 카드 그리드 === */}
      {result.avoidZodiacs.length > 0 && (
        <IncompatibleAnimalsSection avoidZodiacs={result.avoidZodiacs} avoidOh={avoidOh} />
      )}

      {/* === 상세 해석 카드 === */}

      {/* ② 처음엔 이렇게 느껴져요 */}
      <ToggleSection
        title={t('처음엔 이렇게 느껴져요', 'First Impressions')}
        subtitle={firstLine(result.firstImpression)}
        defaultOpen
      >
        <p className="text-[14px] text-gray-700 dark:text-gray-200 leading-[1.8]">
          {result.firstImpression}
        </p>
      </ToggleSection>

      {/* ③ 왜 부딪히게 될까 */}
      <ToggleSection
        title={t('왜 부딪히게 될까', 'Why You Clash')}
        subtitle={firstLine(result.conflictMechanism)}
        titleClassName="text-[15px] font-bold text-red-600 dark:text-red-400 tracking-wide"
      >
        <p className="text-[14px] text-gray-700 dark:text-gray-200 leading-[1.8]">
          {result.conflictMechanism}
        </p>
      </ToggleSection>

      {/* ④ 어떤 상황에서 트러블이 생길까 */}
      <ToggleSection
        title={t('어떤 상황에서 트러블이 생길까', 'When Trouble Arises')}
        subtitle={firstLine(result.conflictScenario)}
        titleClassName="text-[15px] font-bold text-red-600 dark:text-red-400 tracking-wide"
      >
        <p className="text-[14px] text-gray-700 dark:text-gray-200 leading-[1.8]">
          {result.conflictScenario}
        </p>
      </ToggleSection>

      {/* ⑤ 이 관계에서 내가 받는 영향 */}
      <ToggleSection
        title={t('이 관계에서 내가 받는 영향', 'How It Affects You')}
        subtitle={firstLine(result.energyDrain)}
        titleClassName="text-[15px] font-bold text-orange-600 dark:text-orange-400 tracking-wide"
      >
        <p className="text-[14px] text-gray-700 dark:text-gray-200 leading-[1.8]">
          {result.energyDrain}
        </p>
      </ToggleSection>

      {/* ⑥ 이런 신호가 보이면 거리두기 */}
      <ToggleSection
        title={t('이런 신호가 보이면 거리두기', 'Red Flags — Time to Step Back')}
        subtitle={result.redFlags[0] ? firstLine(result.redFlags[0]) : undefined}
        titleClassName="text-[15px] font-bold text-orange-600 dark:text-orange-400 tracking-wide"
      >
        <div className="space-y-2.5">
          {result.redFlags.map((flag, i) => (
            <div key={i} className="rounded-xl bg-red-50/60 dark:bg-red-950/20 border border-red-100 dark:border-red-900/40 p-4">
              <p className="text-[13.5px] text-gray-700 dark:text-gray-200 leading-[1.75]">
                🚩 {flag}
              </p>
            </div>
          ))}
        </div>
      </ToggleSection>

      {/* ⑦ 만약 이미 가까운 사이라면 */}
      <ToggleSection
        title={t('이미 가까운 사이라면', 'If You Are Already Close')}
        subtitle={firstLine(result.copingAdvice)}
        titleClassName="text-[15px] font-bold text-amber-600 dark:text-amber-400 tracking-wide"
      >
        <p className="text-[14px] text-gray-700 dark:text-gray-200 leading-[1.8]">
          {result.copingAdvice}
        </p>
        <p className="mt-4 text-[10.5px] text-gray-400 dark:text-gray-500 leading-snug">
          {t(
            '충·형·파·상극을 종합한 해석입니다. 모든 관계는 노력과 이해로 달라질 수 있어요. 재미로 참고해주세요.',
            'A combined reading of clash, punishment, break, and element opposition. Every relationship can improve with effort — for entertainment only.'
          )}
        </p>
      </ToggleSection>

      {/* === 커플 궁합 CTA 배너 === */}
      <a
        href={localePath('/couple/')}
        className="group flex items-center gap-4 rounded-2xl p-4 mb-3 no-underline transition-transform active:scale-[0.99]"
        style={{ background: '#FFF0F0' }}
      >
        <span
          className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
          style={{ background: '#F3A296', color: '#7E2618' }}
        >
          💞
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14.5px] font-bold leading-tight tracking-tight" style={{ color: '#1A1A1A' }}>
            {t('생각나는 사람이 있나요?', 'Someone on your mind?')}
          </p>
          <p className="text-[12.5px] mt-1" style={{ color: '#4F4F58' }}>
            {t('실제 궁합도 확인해보세요', 'Check the real couple match')}
          </p>
        </div>
        <span className="text-[20px] shrink-0 group-hover:translate-x-0.5 transition-transform" style={{ color: '#A0A0A8' }} aria-hidden>›</span>
      </a>

      {/* === 채팅 CTA 배너 === */}
      <a
        href={localePath('/chat')}
        className="group flex items-center gap-4 rounded-2xl p-4 mb-4 no-underline transition-transform active:scale-[0.99]"
        style={{ background: '#E8F8F0' }}
      >
        <span
          className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
          style={{ background: '#86D4B5', color: '#1B5B45' }}
        >
          💬
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[14.5px] font-bold leading-tight tracking-tight" style={{ color: '#1A1A1A' }}>
            {t('더 궁금한 게 있나요?', 'Want to know more?')}
          </p>
          <p className="text-[12.5px] mt-1" style={{ color: '#4F4F58' }}>
            {t('채팅하러 가기', 'Chat with Saju AI')}
          </p>
        </div>
        <span className="text-[20px] shrink-0 group-hover:translate-x-0.5 transition-transform" style={{ color: '#A0A0A8' }} aria-hidden>›</span>
      </a>
    </>
  );
}
