'use client';

import { useMemo } from 'react';
import { trackEvent } from '@saju/shared/lib/trackEvent';
import { useLang } from '@saju/shared/lib/LangContext';
import type { Pillar } from '@saju/features/fortune/lib/engine';
import { computeIdealMatch, type Gender, type MatchMode } from '../lib/matchEngine';
import { ReasonChip, REASON_EXPLAIN } from './ReasonChip';
import { CompatibleAnimalsSection } from './CompatibleAnimalsSection';
import { ToggleSection } from './ToggleSection';

/** 오행 — 영문 라벨 */
const OH_EN: Record<string, string> = {
  '목': 'Wood', '화': 'Fire', '토': 'Earth', '금': 'Metal', '수': 'Water',
};
/** 12지지 → 서양 띠 */
const ZODIAC_EN: Record<string, string> = {
  '쥐': 'Rat', '소': 'Ox', '호랑이': 'Tiger', '토끼': 'Rabbit',
  '용': 'Dragon', '뱀': 'Snake', '말': 'Horse', '양': 'Goat',
  '원숭이': 'Monkey', '닭': 'Rooster', '개': 'Dog', '돼지': 'Pig',
};

function tagToEn(tag: string): string {
  // "목 일간" → "Wood Day Stem"
  const m = tag.match(/^([목화토금수])\s*일간$/);
  if (m) return `${OH_EN[m[1]]} Day Stem`;
  const m2 = tag.match(/^([목화토금수])\s*보완$/);
  if (m2) return `${OH_EN[m2[1]]} Fill`;
  // 띠 라벨
  if (ZODIAC_EN[tag]) return ZODIAC_EN[tag];
  return tag;
}
function reasonLabelEn(code: string, label: string): string {
  // 라벨은 이제 한국어 서술형 — 영문은 짧은 명사구로 대응.
  // 오행 글자가 어디든 들어있으면 Wood/Fire/... 치환을 찾아둠.
  const ohMatch = label.match(/([목화토금수])/);
  const oh = ohMatch ? OH_EN[ohMatch[1]] : '';
  switch (code) {
    case 'lacking': return oh ? `Fills the missing ${oh} energy` : 'Fills the missing element';
    case 'excess': return oh ? `Balances the overloaded ${oh}` : 'Balances an overloaded element';
    case 'stemHap': return 'Natural attraction (stem harmony)';
    case 'spouseGwan': return 'Matches the traditional "spouse seat"';
    case 'spouseJae': return 'Matches the traditional "spouse seat"';
    case 'samhap': return 'Zodiac triple harmony';
    case 'yukhap': return 'Zodiac pair harmony';
    default: return label;
  }
}

interface Props {
  pillars: Pillar[];
  gender?: Gender;
  /** 본인 출생년 — 동년배 ±7년 범위에서 추천 생년 도출 */
  birthYear?: number;
}

const EL_BG: Record<string, string> = {
  '목': 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800',
  '화': 'bg-red-50 dark:bg-red-950/40 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800',
  '토': 'bg-yellow-50 dark:bg-yellow-950/40 text-yellow-700 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800',
  '금': 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-gray-700',
  '수': 'bg-gray-100 dark:bg-gray-900 text-gray-900 dark:text-gray-100 border-gray-300 dark:border-gray-700',
};

const EL_HERO_BG: Record<string, string> = {
  '목': 'from-emerald-100 to-emerald-50 dark:from-emerald-950/60 dark:to-emerald-950/30',
  '화': 'from-red-100 to-red-50 dark:from-red-950/60 dark:to-red-950/30',
  '토': 'from-yellow-100 to-yellow-50 dark:from-yellow-950/60 dark:to-yellow-950/30',
  '금': 'from-gray-100 to-gray-50 dark:from-gray-800 dark:to-gray-900',
  '수': 'from-gray-200 to-gray-100 dark:from-gray-900 dark:to-gray-950',
};

const EL_BADGE_SOLID: Record<string, string> = {
  '목': 'bg-emerald-500 text-white',
  '화': 'bg-red-600 text-white',
  '토': 'bg-yellow-500 text-black',
  '금': 'bg-gray-300 text-gray-800',
  '수': 'bg-gray-900 text-white',
};

export function IdealMatchSection({ pillars, gender, birthYear }: Props) {
  const { t, lang, localePath } = useLang();
  const mode: MatchMode = 'spouse';

  const match = useMemo(
    () => computeIdealMatch(pillars, gender || '', birthYear, mode),
    [pillars, gender, birthYear],
  );

  if (!match) return null;

  /** 텍스트에서 첫 문장(마침표·물음표·느낌표 기준)을 추출 */
  const firstLine = (text: string) => {
    const m = text.match(/^.+?[.?!。]\s?/);
    return m ? m[0].trim() : text.slice(0, 40) + '…';
  };

  const primaryOh = match.idealStemOh[0];
  const primaryStem = match.tags[0]?.replace(/\s*일간$/, '') ?? primaryOh;
  const primaryOhLabel = lang === 'en' ? OH_EN[primaryOh] ?? primaryOh : primaryOh;
  const genderHint = !gender
    ? t(
        '성별을 선택하시면 배우자궁(관성·재성) 해석까지 반영돼요.',
        'Select a gender to include Spouse Star (Gwan/Jae) weighting.'
      )
    : null;

  // 추천 생년 → 띠별 그룹
  const yearsByZodiac = (() => {
    const g = new Map<string, number[]>();
    for (const it of match.idealYears) {
      const arr = g.get(it.zodiac) || [];
      arr.push(it.year);
      g.set(it.zodiac, arr);
    }
    return Array.from(g.entries());
  })();

  return (
    <>
      {/* 역산 방식 안내 */}
      <p className="text-[10px] text-gray-400 dark:text-gray-500 mb-3 leading-snug px-1 italic">
        {t(
          '상대의 생년월일 없이 내 사주만으로 이상형을 역산합니다. 점수는 이 추천이 내 결핍·과잉을 얼마나 잘 보완하는지 보여주는 적합도예요.',
          'We reverse-engineer an ideal partner from your chart alone — no partner data. The score shows how well this recommendation fills the gaps in your chart.'
        )}
      </p>
      {/* === 당신과 잘 어울리는 파트너 === */}
      <div className="mb-4">
        <h2 className="text-[18px] font-extrabold text-gray-900 dark:text-gray-50 tracking-[-0.02em] mb-1.5">
          {t('당신과 잘 어울리는 파트너', 'A Partner That Suits You')}
        </h2>
        <p className="text-[14px] text-gray-600 dark:text-gray-300 leading-[1.7]">
          {lang === 'en'
            ? `A partner with ${primaryOhLabel} energy fits you well.`
            : match.summary}
        </p>
      </div>

      {/* === 잘 어울리는 동물 카드 그리드 === */}
      {match.idealZodiacs.length > 0 && (
        <CompatibleAnimalsSection
          idealZodiacs={match.idealZodiacs}
          primaryOh={primaryOh}
        />
      )}

      {/* === 상세 해석: 9개 분리 카드 === */}

      {/* ② 이 사람 첫인상 */}
      <ToggleSection
        title={t('이 사람 첫인상', 'First Impression')}
        subtitle={firstLine(match.firstImpression)}
        defaultOpen
      >
        <p className="text-[14px] text-gray-700 dark:text-gray-200 leading-[1.8]">
          {match.firstImpression}
        </p>
      </ToggleSection>

      {/* ③ 이 사람 속마음 */}
      <ToggleSection
        title={t('이 사람 속마음', 'Behind the Surface')}
        subtitle={firstLine(match.innerSelf)}
      >
        <p className="text-[14px] text-gray-700 dark:text-gray-200 leading-[1.8]">
          {match.innerSelf}
        </p>
      </ToggleSection>

      {/* ④ 왜 나랑 잘 맞을까 ①: 성격 궁합 */}
      <ToggleSection
        title={t('왜 나랑 잘 맞을까 ①: 성격 궁합', 'Why We Click ①: Personality')}
        subtitle={firstLine(match.chemistryStory)}
        titleClassName="text-[15px] font-bold text-pink-600 dark:text-pink-400 tracking-wide"
      >
        <p className="text-[14px] text-gray-700 dark:text-gray-200 leading-[1.8]">
          {match.chemistryStory}
        </p>
      </ToggleSection>

      {/* ⑤ 왜 나랑 잘 맞을까 ②: 연애할 때 케미 */}
      <ToggleSection
        title={t('왜 나랑 잘 맞을까 ②: 연애할 때 케미', 'Why We Click ②: Dating Chemistry')}
        subtitle={firstLine(match.datingChemistry)}
        titleClassName="text-[15px] font-bold text-pink-600 dark:text-pink-400 tracking-wide"
      >
        <p className="text-[14px] text-gray-700 dark:text-gray-200 leading-[1.8]">
          {match.datingChemistry}
        </p>
      </ToggleSection>

      {/* ⑥ 어디서 만나게 될까 */}
      <ToggleSection
        title={t('어디서 만나게 될까', 'Where Might You Meet?')}
        subtitle={firstLine(match.meetingScenario)}
        titleClassName="text-[15px] font-bold text-violet-600 dark:text-violet-400 tracking-wide"
      >
        <p className="text-[14px] text-gray-700 dark:text-gray-200 leading-[1.8]">
          {match.meetingScenario}
        </p>
      </ToggleSection>

      {/* ⑦ 어떻게 가까워질까 */}
      <ToggleSection
        title={t('어떻게 가까워질까', 'How to Get Closer')}
        subtitle={firstLine(match.approachStory)}
        titleClassName="text-[15px] font-bold text-violet-600 dark:text-violet-400 tracking-wide"
      >
        <p className="text-[14px] text-gray-700 dark:text-gray-200 leading-[1.8]">
          {match.approachStory}
        </p>
      </ToggleSection>

      {/* ⑧ 이런 순간에 설렐 거예요 */}
      <ToggleSection
        title={t('이런 순간에 설렐 거예요', 'Moments That Will Make Your Heart Flutter')}
        subtitle={match.sparkMoments[0] ? firstLine(match.sparkMoments[0]) : undefined}
        titleClassName="text-[15px] font-bold text-rose-600 dark:text-rose-400 tracking-wide"
      >
        <div className="space-y-3">
          {match.sparkMoments.map((moment, i) => (
            <div key={i} className="rounded-xl bg-rose-50/60 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/40 p-4">
              <p className="text-[13.5px] text-gray-700 dark:text-gray-200 leading-[1.75]">
                {moment}
              </p>
            </div>
          ))}
        </div>
      </ToggleSection>

      {/* ⑨ 주의할 점 + 추천/주의 띠 */}
      <ToggleSection
        title={t('주의할 점', 'Watch Out')}
        subtitle={match.cautions[0] ? firstLine(match.cautions[0].desc) : undefined}
        titleClassName="text-[15px] font-bold text-amber-600 dark:text-amber-400 tracking-wide"
      >
        {match.cautions.length > 0 && (
          <p className="text-[14px] text-gray-700 dark:text-gray-200 leading-[1.8] mb-4">
            {match.cautions.map(c => c.desc).join(' ')}
          </p>
        )}
        {(match.idealZodiacs.length > 0 || match.avoidZodiacs.length > 0) && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-3 border-t border-gray-100 dark:border-gray-800">
            {match.idealZodiacs.length > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-semibold text-gray-400 dark:text-gray-500">
                  {t('추천 띠', 'Best')}
                </span>
                {match.idealZodiacs.map((z, i) => (
                  <span key={i} className="px-2 py-0.5 rounded-full bg-pink-50 dark:bg-pink-950/40 text-pink-600 dark:text-pink-300 text-[11px] font-medium">
                    {lang === 'en' ? (ZODIAC_EN[z] ?? z) : z}
                  </span>
                ))}
              </div>
            )}
            {match.avoidZodiacs.length > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-semibold text-gray-400 dark:text-gray-500">
                  {t('주의 띠', 'Avoid')}
                </span>
                {match.avoidZodiacs.map((z, i) => (
                  <span key={i} className="px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400 text-[11px] font-medium">
                    {lang === 'en' ? (ZODIAC_EN[z] ?? z) : z}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
        <p className="mt-4 text-[10.5px] text-gray-400 dark:text-gray-500 leading-snug">
          {t(
            '오행 보완·천간합·지지 삼합/육합을 종합한 해석입니다. 재미로 참고해주세요.',
            'A combined reading of element balance, stem harmony, and branch harmony — for entertainment only.'
          )}
        </p>
      </ToggleSection>

      {/* === 커플 궁합 CTA 배너 === */}
      <a
        href={localePath('/couple/')}
        onClick={() => trackEvent('ideal_match_to_couple', { primary_oh: primaryOh })}
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
