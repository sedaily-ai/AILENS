'use client';

import { useMemo, useState } from 'react';
import { trackEvent } from '@/shared/lib/trackEvent';
import { useLang } from '@/shared/lib/LangContext';
import type { Pillar } from '@/features/fortune/lib/engine';
import { computeIdealMatch, type Gender, type MatchMode } from '../lib/matchEngine';
import { ShareCard } from './ShareCard';
import { ReasonChip, REASON_EXPLAIN } from './ReasonChip';

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
  /** 핑크 CTA "두 사람 궁합도 확인" 클릭 시 — 같은 페이지 내 커플 탭으로 전환.
   *  미지정 시 기본 href 동작 (/saju-match?tab=couple 풀 네비) */
  onGoCouple?: () => void;
}

const EL_BG: Record<string, string> = {
  '목': 'bg-green-50 text-green-700 border-green-200',
  '화': 'bg-red-50 text-red-700 border-red-200',
  '토': 'bg-yellow-50 text-yellow-700 border-yellow-200',
  '금': 'bg-gray-100 text-gray-700 border-gray-200',
  '수': 'bg-blue-50 text-blue-700 border-blue-200',
};

const EL_HERO_BG: Record<string, string> = {
  '목': 'from-green-100 to-emerald-50',
  '화': 'from-rose-100 to-orange-50',
  '토': 'from-amber-100 to-yellow-50',
  '금': 'from-slate-100 to-gray-50',
  '수': 'from-sky-100 to-indigo-50',
};

const EL_BADGE_SOLID: Record<string, string> = {
  '목': 'bg-green-600 text-white',
  '화': 'bg-rose-600 text-white',
  '토': 'bg-amber-600 text-white',
  '금': 'bg-slate-600 text-white',
  '수': 'bg-sky-600 text-white',
};

export function IdealMatchSection({ pillars, gender, birthYear, onGoCouple }: Props) {
  const { t, lang, localePath } = useLang();
  const [mode, setMode] = useState<MatchMode>('spouse');
  const [shareOpen, setShareOpen] = useState(false);

  const match = useMemo(
    () => computeIdealMatch(pillars, gender || '', birthYear, mode),
    [pillars, gender, birthYear, mode],
  );

  if (!match) return null;

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
      {/* === 모드 토글 + 공유 버튼 === */}
      <div className="flex items-center gap-2 mb-2">
        <div className="flex-1 flex bg-gray-100 rounded-full p-0.5" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'spouse'}
            onClick={() => {
              setMode('spouse');
              trackEvent('ideal_match_mode', { mode: 'spouse' });
            }}
            className={`flex-1 py-1.5 text-[12px] font-semibold rounded-full border-none cursor-pointer transition-colors ${
              mode === 'spouse'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'bg-transparent text-gray-500'
            }`}
          >
            {t('현실 궁합', 'Real-life fit')}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'element'}
            onClick={() => {
              setMode('element');
              trackEvent('ideal_match_mode', { mode: 'element' });
            }}
            className={`flex-1 py-1.5 text-[12px] font-semibold rounded-full border-none cursor-pointer transition-colors ${
              mode === 'element'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'bg-transparent text-gray-500'
            }`}
          >
            {t('오행 보완', 'Element fill')}
          </button>
        </div>
        <button
          type="button"
          onClick={() => {
            setShareOpen(true);
            trackEvent('ideal_match_share_open');
          }}
          className="shrink-0 h-8 px-3 rounded-full bg-gray-900 text-white text-[11.5px] font-bold border-none cursor-pointer hover:opacity-90 transition-opacity"
        >
          {t('공유', 'Share')}
        </button>
      </div>

      {/* 모드별 설명 + 역산 방식 안내 */}
      <p className="text-[10.5px] text-gray-500 mb-1 leading-snug px-1">
        {mode === 'spouse'
          ? t(
              '배우자궁·천간합 가중 — 현실적으로 잘 만나는 상대',
              'Weighted toward Spouse Star & Stem harmony — who you actually meet in real life.'
            )
          : t(
              '오행 보완 가중 — 부족한 기운을 채워주는 상대',
              'Weighted toward element balance — who fills the gaps in your chart.'
            )}
      </p>
      <p className="text-[10px] text-gray-400 mb-3 leading-snug px-1 italic">
        {t(
          '상대의 생년월일 없이 내 사주만으로 이상형을 역산합니다. 점수는 이 추천이 내 결핍·과잉을 얼마나 잘 보완하는지 보여주는 적합도예요.',
          'We reverse-engineer an ideal partner from your chart alone — no partner data. The score shows how well this recommendation fills the gaps in your chart.'
        )}
      </p>
      {/* === Hero 파트너 카드 === */}
      <div className={`relative overflow-hidden rounded-[20px] mb-3 bg-gradient-to-br ${EL_HERO_BG[primaryOh] ?? 'from-gray-100 to-gray-50'} border border-gray-200`}>
        <div className="px-5 pt-5 pb-4">
          <div className="flex items-start justify-between gap-3 mb-3">
            <div>
              <div className="text-[10.5px] font-bold tracking-[0.14em] text-gray-500 uppercase mb-1">
                {t('당신의 이상형', 'Your Ideal Match')}
              </div>
              <div className="text-[20px] font-extrabold text-gray-900 leading-[1.25] tracking-[-0.02em]">
                {lang === 'en'
                  ? `A partner with ${primaryOhLabel} energy fits you well.`
                  : match.summary}
              </div>
            </div>
            <div className="shrink-0 flex flex-col items-center">
              <div className="text-[11px] font-semibold text-gray-500">{t('적합도', 'Fit')}</div>
              <div className="text-[28px] font-black text-gray-900 leading-none mt-0.5">
                {match.score.toFixed(1)}
              </div>
              <div className="text-[10px] text-gray-400 mt-0.5">/ 10</div>
            </div>
          </div>

          <div className="flex items-center gap-2 mb-4">
            <div className={`w-11 h-11 rounded-[12px] flex items-center justify-center text-[18px] font-bold shrink-0 ${EL_BADGE_SOLID[primaryOh] ?? 'bg-gray-700 text-white'}`}>
              {primaryStem}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[11px] text-gray-500 font-medium">{t('추천 일간', 'Suggested Day Stem')}</div>
              <div className="text-[13px] font-semibold text-gray-800 truncate">
                {primaryStem} · {t(`${primaryOh} 기운`, `${primaryOhLabel} energy`)}
              </div>
            </div>
          </div>

          {/* 추천 생년 3개 압축 */}
          {yearsByZodiac.length > 0 && (
            <div className="bg-white/70 backdrop-blur rounded-xl px-3.5 py-2.5 mb-3">
              <div className="text-[10.5px] font-bold text-gray-500 mb-1.5 tracking-wide">
                ♡ {t('이런 사람을 찾아보세요', 'Look for someone like this')}
              </div>
              <div className="space-y-0.5">
                {yearsByZodiac.slice(0, 2).map(([zodiac, years]) => (
                  <div key={zodiac} className="text-[13px] text-gray-800 leading-relaxed">
                    <span className="font-bold">
                      {years.slice(0, 3).map(y => lang === 'en' ? `born ${y}` : `${y}년생`).join(' · ')}
                    </span>
                    <span className="text-gray-400 ml-1.5">
                      {lang === 'en' ? (ZODIAC_EN[zodiac] ?? zodiac) : zodiac}
                    </span>
                  </div>
                ))}
                {match.idealMonths.length > 0 && (
                  <div className="text-[11.5px] text-gray-500 pt-0.5">
                    {t('추천 생월', 'Birth month')} · {match.idealMonths.map(m => lang === 'en' ? `${m}` : `${m}월`).join(' · ')}
                  </div>
                )}
              </div>
            </div>
          )}
          {yearsByZodiac.length === 0 && birthYear === undefined && (
            <div className="bg-white/70 rounded-xl px-3.5 py-2 mb-3 text-[11.5px] text-gray-500 leading-snug">
              {t(
                '생년월일을 입력하시면 구체적인 추천 생년이 표시돼요.',
                'Enter your birth date to see specific suggested birth years.'
              )}
            </div>
          )}

          {/* 근거 칩 (클릭 시 설명 툴팁) */}
          {match.scoreReasons.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {match.scoreReasons.map((r, i) => (
                <ReasonChip
                  key={i}
                  code={r.code}
                  label={r.label}
                  labelEn={reasonLabelEn(r.code, r.label)}
                  points={r.points}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* === 점수 근거 자세히 보기 — 항상 펼쳐짐 === */}
      {match.scoreReasons.length > 0 && (
        <div className="rounded-xl bg-white border border-gray-200 p-4 mb-3">
          <div className="text-[12px] font-bold text-gray-500 mb-1 tracking-wide">
            {t('이 점수, 이런 이유로 이렇게 나왔어요', 'Why the score came out this way')}
          </div>
          <p className="text-[12px] text-gray-500 leading-[1.65] mb-3">
            {t(
              '상대의 생년월일 없이 당신 사주 하나로 이상형을 역산한 거예요. 점수가 높을수록 내 사주에 비어있는 자리·끌림이 오는 타입·전통적으로 "배우자 자리"로 보는 기운이 여러 개 한꺼번에 맞아떨어졌다는 뜻입니다. 상대와의 실제 궁합 점수가 아니라 "이 추천이 나한테 얼마나 잘 맞는지"를 보여주는 점수예요.',
              'This score comes from your chart alone — no partner data. A higher score means the recommendation hits multiple axes at once: the element your chart lacks, the type your chart is naturally drawn to, and the element classical saju places in the "spouse seat." It measures how well the pick fits you, not compatibility with a specific partner.'
            )}
          </p>
          <div className="space-y-3">
            {match.scoreReasons.map((r, i) => {
              const info = REASON_EXPLAIN[r.code];
              if (!info) return null;
              return (
                <div key={i}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[11.5px] font-bold text-pink-600">
                      {lang === 'en' ? info.tagEn : info.tagKo}
                    </span>
                    <span className="text-gray-300 text-[11px]">·</span>
                    <span className="text-[12.5px] font-bold text-gray-800">
                      {lang === 'en' ? reasonLabelEn(r.code, r.label) : r.label}
                    </span>
                    <span className="text-[11px] font-bold px-1.5 py-0.5 rounded-md bg-pink-50 text-pink-700">
                      +{r.points}
                    </span>
                  </div>
                  <p className="text-[12.5px] text-gray-600 leading-[1.65]">
                    {lang === 'en' ? info.en : info.ko}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* === 상세 카드 === */}
      <div className="bg-white border border-gray-200 rounded-[16px] overflow-hidden mb-4">
        <div className="px-5 py-4 flex items-center gap-2 border-b border-gray-100">
          <span className="inline-block text-[11px] font-bold text-pink-600 tracking-wider">
            {t('상세 해석', 'Details')}
          </span>
          <span className="text-[15px] font-bold text-gray-900">
            {t('외모 · 성향 · 근거', 'Look · Personality · Reasoning')}
          </span>
        </div>

        <div className="px-5 pb-5 pt-4">
          {/* 태그 */}
          {match.tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-4">
              {match.tags.map((tag, i) => {
                const ohMatch = tag.match(/^([목화토금수])/);
                const oh = ohMatch ? ohMatch[1] : '';
                const cls = oh && EL_BG[oh]
                  ? EL_BG[oh]
                  : 'bg-gray-50 text-gray-700 border-gray-200';
                return (
                  <span key={i} className={`inline-block px-2.5 py-1 rounded-full border text-[11.5px] font-medium ${cls}`}>
                    {lang === 'en' ? tagToEn(tag) : tag}
                  </span>
                );
              })}
            </div>
          )}

          {genderHint && (
            <p className="text-[11px] text-gray-400 mb-4 leading-snug">
              💡 {genderHint}
            </p>
          )}

          {/* 외모·분위기 */}
          {match.appearance.length > 0 && (
            <div className="mb-4">
              <div className="text-[12px] font-bold text-gray-500 mb-1.5">
                {t('외모·분위기', 'Look & Vibe')}
              </div>
              <ul className="space-y-1">
                {match.appearance.map((line, i) => (
                  <li key={i} className="text-[13.5px] text-gray-700 leading-relaxed flex gap-2">
                    <span className="text-gray-300 shrink-0">·</span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
              {lang === 'en' && (
                <p className="mt-1.5 text-[10.5px] text-gray-400 italic">
                  Detailed lines remain in Korean — English translation in progress.
                </p>
              )}
            </div>
          )}

          {/* 성향 */}
          {match.personality.length > 0 && (
            <div className="mb-4">
              <div className="text-[12px] font-bold text-gray-500 mb-1.5">
                {t('성향', 'Personality')}
              </div>
              <ul className="space-y-1">
                {match.personality.map((line, i) => (
                  <li key={i} className="text-[13.5px] text-gray-700 leading-relaxed flex gap-2">
                    <span className="text-gray-300 shrink-0">·</span>
                    <span>{line}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 잘 맞는 점 */}
          {match.strengths.length > 0 && (
            <div className="mb-3 rounded-xl bg-green-50/60 border border-green-100 p-3.5">
              <div className="text-[12px] font-bold text-green-700 mb-1.5">
                ✓ {t('잘 맞는 점', 'Strengths')}
              </div>
              <ul className="space-y-1.5">
                {match.strengths.map((s, i) => (
                  <li key={i} className="text-[13px] text-gray-700 leading-relaxed">
                    {s.desc}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 주의할 점 */}
          {match.cautions.length > 0 && (
            <div className="mb-4 rounded-xl bg-amber-50/60 border border-amber-100 p-3.5">
              <div className="text-[12px] font-bold text-amber-700 mb-1.5">
                ⚠ {t('주의할 점', 'Watch out')}
              </div>
              <ul className="space-y-1.5">
                {match.cautions.map((c, i) => (
                  <li key={i} className="text-[13px] text-gray-700 leading-relaxed">
                    {c.desc}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* 추천 띠 / 주의할 띠 */}
          {(match.idealZodiacs.length > 0 || match.avoidZodiacs.length > 0) && (
            <div className="flex flex-col gap-2 pt-2 border-t border-gray-100">
              {match.idealZodiacs.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11.5px] font-semibold text-gray-500 shrink-0">
                    {t('추천 띠', 'Best zodiac')}
                  </span>
                  {match.idealZodiacs.map((z, i) => (
                    <span key={i} className="px-2 py-0.5 rounded-full bg-pink-50 text-pink-700 text-[11.5px] font-medium">
                      {lang === 'en' ? (ZODIAC_EN[z] ?? z) : z}
                    </span>
                  ))}
                </div>
              )}
              {match.avoidZodiacs.length > 0 && (
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[11.5px] font-semibold text-gray-500 shrink-0">
                    {t('주의할 띠', 'Avoid zodiac')}
                  </span>
                  {match.avoidZodiacs.map((z, i) => (
                    <span key={i} className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 text-[11.5px] font-medium">
                      {lang === 'en' ? (ZODIAC_EN[z] ?? z) : z}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          <p className="mt-4 text-[10.5px] text-gray-400 leading-snug">
            {t(
              '오행 보완·천간합·지지 삼합/육합을 종합한 해석입니다. 재미로 참고해주세요.',
              'A combined reading of element balance, stem harmony, and branch harmony — for entertainment only.'
            )}
          </p>
        </div>
      </div>

      {/* === 커플 궁합 CTA 배너 === ailens.sedaily.ai 는 /saju-match 한 페이지에 탭으로 통합.
           onGoCouple 가 주어지면 client-side 탭 전환 (mine 상태 유지), 없으면 풀 네비 fallback. */}
      <a
        href="/saju-match?tab=couple"
        onClick={(e) => {
          trackEvent('ideal_match_to_couple', { primary_oh: primaryOh });
          if (onGoCouple) {
            e.preventDefault();
            onGoCouple();
          }
        }}
        className="group block rounded-[18px] overflow-hidden mb-4 no-underline bg-gradient-to-br from-pink-500 to-rose-500 hover:from-pink-600 hover:to-rose-600 transition-colors shadow-sm"
      >
        <div className="px-5 py-4 flex items-center gap-3">
          <div className="shrink-0 w-11 h-11 rounded-full bg-white/20 backdrop-blur flex items-center justify-center text-[20px]">
            💞
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[10.5px] font-bold tracking-[0.14em] uppercase text-white/80 mb-0.5">
              {t('다음 단계', 'Next')}
            </div>
            <div className="text-[15px] font-extrabold text-white leading-tight">
              {t('두 사람 실제 궁합도 확인해보세요', 'Check the real couple match')}
            </div>
            <div className="text-[11.5px] text-white/90 leading-snug mt-0.5">
              {t(
                '상대 생년월일을 넣으면 두 사주 간 일간 관계·일지 합충까지 비교해드려요',
                'Enter both birth dates to compare day stems and branches directly'
              )}
            </div>
          </div>
          <div className="shrink-0 text-white text-[22px] font-bold group-hover:translate-x-0.5 transition-transform">
            →
          </div>
        </div>
      </a>

      {shareOpen && (
        <ShareCard
          match={match}
          mode={mode}
          primaryStem={primaryStem}
          primaryOh={primaryOh}
          onClose={() => setShareOpen(false)}
        />
      )}
    </>
  );
}
