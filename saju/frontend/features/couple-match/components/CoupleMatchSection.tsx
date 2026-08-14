'use client';

import { useMemo } from 'react';
import { useLang } from '@saju/shared/lib/LangContext';
import {
  computeCoupleMatch,
  type PersonInput,
  type CoupleReasonCode,
} from '../lib/coupleEngine';
import { buildCoupleInsights } from '../lib/coupleInsights';
import { ToggleSection } from '@saju/features/ideal-match/components/ToggleSection';
import { sipsung, CG_OH, JJG, type Pillar } from '@saju/features/fortune/lib/engine';
import { type Oh, OH_SAENG, OH_GEUK } from '@saju/features/ideal-match/lib/personaDictionary';

interface Props {
  a: PersonInput;
  b: PersonInput;
  onReset?: () => void;
}

const OH_EN: Record<string, string> = {
  '목': 'Wood', '화': 'Fire', '토': 'Earth', '금': 'Metal', '수': 'Water',
};

const EL_HERO_BG: Record<string, string> = {
  '목': 'from-white to-white dark:from-gray-900 dark:to-gray-900',
  '화': 'from-white to-white dark:from-gray-900 dark:to-gray-900',
  '토': 'from-white to-white dark:from-gray-900 dark:to-gray-900',
  '금': 'from-white to-white dark:from-gray-900 dark:to-gray-900',
  '수': 'from-white to-white dark:from-gray-900 dark:to-gray-900',
};

const REASON_EXPLAIN: Record<CoupleReasonCode, { ko: string; en: string }> = {
  stemHap: {
    ko: '두 사람의 일간이 천간합(甲己·乙庚·丙辛·丁壬·戊癸) 관계입니다. 감정적 끌림이 강한 조합이에요.',
    en: 'Your day stems form a harmonious pair (Gap-Gi, Eul-Gyeong, etc.). Strong emotional attraction.',
  },
  stemSaeng: {
    ko: '한쪽의 오행이 상대 오행을 낳는 생(生) 관계. 자연스럽게 키워주고 받는 조합.',
    en: 'One day stem nourishes the other. A naturally giving–receiving pairing.',
  },
  stemGeuk: {
    ko: '일간끼리 극(剋) 관계로 충돌이 있을 수 있으나, 서로를 자극하고 성장시키는 조합.',
    en: 'Day stems clash; challenging but can stimulate growth.',
  },
  stemSame: {
    ko: '같은 오행의 일간끼리. 가치관이 닿지만 자극은 적을 수 있어요.',
    en: 'Same element stems. Aligned values, but perhaps less spark.',
  },
  branchSamhap: {
    ko: '일지 삼합 관계 — 셋이 한 축을 이루는 강한 조화.',
    en: 'Earthly branches form a triple harmony — a strong three-way bond.',
  },
  branchYukhap: {
    ko: '일지 육합 관계 — 짝을 이루는 부드러운 조화.',
    en: 'Earthly branches form a six-harmony pair — soft complementary bond.',
  },
  branchChung: {
    ko: '일지 충(沖) 관계 — 생활 리듬이 어긋나기 쉬워 주의가 필요해요.',
    en: 'Clashing day branches — daily rhythms can easily misalign.',
  },
  branchSame: {
    ko: '같은 일지 — 비슷한 생활 패턴, 익숙하지만 변화는 적음.',
    en: 'Same day branch — similar daily patterns, familiar but less variety.',
  },
  elementFill: {
    ko: '서로 부족한 오행을 채워주는 관계. 관계가 안정적으로 유지돼요.',
    en: 'You fill each other\'s missing elements — the partnership stays balanced.',
  },
  spouseMatch: {
    ko: '한쪽의 배우자성 오행이 상대 일간과 일치 — 전통 명리에서 가장 이상적인 배우자 패턴.',
    en: 'One chart\'s Spouse Star matches the other\'s day stem — the classical ideal pairing.',
  },
  ageGap: {
    ko: '연령차가 10년 이상 — 생활 리듬·세대 코드가 달라 조율이 필요합니다.',
    en: 'Age gap of 10+ years — may need more effort to align life rhythms.',
  },
};

export function CoupleMatchSection({ a, b, onReset }: Props) {
  const { t, lang } = useLang();

  const match = useMemo(() => computeCoupleMatch(a, b), [a, b]);
  const insights = useMemo(
    () => (match ? buildCoupleInsights(match.score, match.reasons) : null),
    [match],
  );
  if (!match || !insights) return null;

  /** 텍스트에서 첫 문장(마침표·물음표·느낌표 기준)을 추출 */
  const firstLine = (text: string) => {
    const m = text.match(/^.+?[.?!。]\s?/);
    return m ? m[0].trim() : text.slice(0, 40) + '…';
  };

  const ohLabel = (oh: string) => (lang === 'en' ? OH_EN[oh] ?? oh : oh);
  const scoreColor =
    match.score >= 8 ? 'text-pink-600 dark:text-pink-400'
    : match.score >= 5 ? 'text-gray-900 dark:text-gray-50'
    : 'text-amber-700 dark:text-amber-400';

  const primaryOh = match.a.oh;

  return (
    <div className="space-y-3">
      {/* Hero — 항상 표시 */}
      <div className={`relative overflow-hidden rounded-[20px] bg-gradient-to-br ${EL_HERO_BG[primaryOh]} shadow-[0_1px_4px_rgba(0,0,0,0.06)]`}>
        <div className="px-5 pt-5 pb-4">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <div className="text-[10.5px] font-bold tracking-[0.14em] text-gray-500 dark:text-gray-300 uppercase mb-1">
                {t('커플 궁합', 'Couple Match')}
              </div>
              <div className="text-[18px] font-extrabold text-gray-900 dark:text-gray-100 leading-[1.3] tracking-[-0.01em]">
                {match.headline}
              </div>
              {/* 궁합 유형 태그 */}
              <div className="mt-1.5 inline-flex items-center px-2.5 py-1 rounded-full bg-pink-100 dark:bg-pink-950/50 border border-pink-200 dark:border-pink-900">
                <span className="text-[11px] font-bold text-pink-700 dark:text-pink-300">
                  {lang === 'en' ? match.typeName.en : match.typeName.ko}
                </span>
              </div>
            </div>
            <div className="shrink-0 flex flex-col items-center">
              <div className="text-[11px] font-semibold text-gray-500 dark:text-gray-300">
                {t('궁합', 'Score')}
              </div>
              <div className={`text-[30px] font-black leading-none mt-0.5 ${scoreColor}`}>
                {match.score.toFixed(1)}
              </div>
              <div className="text-[10px] text-gray-400 dark:text-gray-500 mt-0.5">/ 10</div>
            </div>
          </div>

          {/* 두 사람 사주팔자 — 좌우 한 행 배치 (SajuTable 디자인 시스템) */}
          <CouplePillarRow
            aLabel={a.label ?? t('나', 'Me')}
            bLabel={b.label ?? t('상대', 'Partner')}
            aPillars={a.pillars}
            bPillars={b.pillars}
            aIlgan={a.pillars[1]?.c ?? ''}
            bIlgan={b.pillars[1]?.c ?? ''}
          />

          {/* 근거 칩 */}
          {match.reasons.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {match.reasons.map((r, i) => {
                const explain = REASON_EXPLAIN[r.code];
                const title = explain ? (lang === 'en' ? explain.en : explain.ko) : '';
                const positive = r.points > 0;
                return (
                  <span
                    key={i}
                    title={title}
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10.5px] font-medium border ${
                      positive
                        ? 'bg-white/80 dark:bg-gray-900/60 text-gray-700 dark:text-gray-200 border-gray-200 dark:border-gray-700'
                        : 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-900'
                    }`}
                  >
                    {r.label}
                    <span className={positive ? 'text-pink-600 dark:text-pink-400 font-bold' : 'text-amber-600 dark:text-amber-400 font-bold'}>
                      {r.points > 0 ? `+${r.points}` : r.points}
                    </span>
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 오행 상생상극 다이어그램 */}
      <OhaengDiagram aOh={match.a.oh} bOh={match.b.oh} t={t} lang={lang} />

      {/* 1. 종합 해설 — 기본 열림, 서술형 문단 중심 */}
      <ToggleSection
        title={t('종합 해설', 'Overall Reading')}
        subtitle={firstLine(lang === 'en' ? insights.narrative.en : insights.narrative.ko)}
        defaultOpen={true}
      >
        <div className="space-y-3">
          <p className="text-[13.5px] text-gray-800 dark:text-gray-100 leading-[1.8]">
            {lang === 'en' ? insights.narrative.en : insights.narrative.ko}
          </p>
          <p className="text-[13px] text-gray-600 dark:text-gray-300 leading-[1.8]">
            {t(
              `${ohLabel(match.a.oh)}(${a.label ?? '나'})과 ${ohLabel(match.b.oh)}(${b.label ?? '상대'})의 조합은, 두 사람의 일간 오행이 서로에게 어떤 에너지를 주고받는지를 보여줍니다. 위 점수는 천간합·상생·상극 같은 일간 관계, 삼합·육합·충 같은 일지 관계, 그리고 서로의 부족한 오행을 채워주는 보완 관계까지 종합적으로 고려한 결과입니다.`,
              `The ${ohLabel(match.a.oh)} (${a.label ?? 'Me'}) and ${ohLabel(match.b.oh)} (${b.label ?? 'Partner'}) combination shows the energy exchange between your day master elements. The score above considers stem harmony/clash, branch triple-harmony/six-harmony/clash, and how well you complement each other's missing elements.`
            )}
          </p>
        </div>
      </ToggleSection>

      {/* 2. 잘 맞는 점 — 기본 열림, 서술형 */}
      {match.strengths.length > 0 && (
        <ToggleSection
          title={t('잘 맞는 점', 'Strengths')}
          subtitle={firstLine(match.strengths[0])}
          titleClassName="text-[15px] font-bold text-green-700 dark:text-green-400 tracking-wide"
          defaultOpen={true}
        >
          <div className="space-y-3">
            <p className="text-[13px] text-gray-500 dark:text-gray-400 leading-[1.7]">
              {t(
                '두 사람의 오행 조합에서 자연스럽게 나타나는 장점들입니다. 의식하지 않아도 이미 작동하고 있을 가능성이 높으며, 이 흐름을 인지하고 적극 활용하면 관계가 더욱 깊어집니다.',
                'These are the natural advantages that emerge from your element combination. They are likely already at work even without conscious effort — recognizing and leaning into them deepens the relationship further.'
              )}
            </p>
            {match.strengths.map((s, i) => (
              <div key={i} className="bg-green-50/50 dark:bg-green-950/20 rounded-lg p-3">
                <p className="text-[13.5px] text-gray-800 dark:text-gray-100 leading-[1.75]">
                  <span className="text-green-600 dark:text-green-400 font-bold mr-1">✓</span>
                  {s}
                </p>
              </div>
            ))}
          </div>
        </ToggleSection>
      )}

      {/* 3. 주의할 점 — 기본 열림, 서술형 */}
      {match.cautions.length > 0 && (
        <ToggleSection
          title={t('주의할 점', 'Watch out')}
          subtitle={firstLine(match.cautions[0])}
          titleClassName="text-[15px] font-bold text-amber-700 dark:text-amber-400 tracking-wide"
          defaultOpen={true}
        >
          <div className="space-y-3">
            <p className="text-[13px] text-gray-500 dark:text-gray-400 leading-[1.7]">
              {t(
                '아래 항목은 "안 맞는다"는 뜻이 아니라, 이 오행 조합에서 의식적으로 신경 써야 관계가 무탈하게 이어지는 포인트입니다. 미리 알고 있으면 작은 갈등이 커지기 전에 조율할 수 있어요.',
                'These aren\'t deal-breakers — they\'re the friction points this element pairing tends to produce. Knowing them in advance lets you adjust before small tensions snowball.'
              )}
            </p>
            {match.cautions.map((c, i) => (
              <div key={i} className="bg-amber-50/50 dark:bg-amber-950/20 rounded-lg p-3">
                <p className="text-[13.5px] text-gray-800 dark:text-gray-100 leading-[1.75]">
                  <span className="text-amber-600 dark:text-amber-400 font-bold mr-1">⚠</span>
                  {c}
                </p>
              </div>
            ))}
          </div>
        </ToggleSection>
      )}

      {/* 4. 근거 자세히 보기 — 기본 접힘, 태그 미리보기 */}
      {insights.reasonDetails.length > 0 && (
        <ToggleSection
          title={`${t('근거 자세히 보기', 'See the reasoning')} · ${match.reasons.slice(0, 3).map(r => r.label.split(' ')[0]).join(' · ')}`}
          subtitle={insights.reasonDetails[0] ? firstLine(lang === 'en' ? insights.reasonDetails[0].en : insights.reasonDetails[0].ko) : undefined}
          defaultOpen={false}
        >
          <div className="space-y-4">
            <p className="text-[13px] text-gray-500 dark:text-gray-400 leading-[1.7]">
              {t(
                '위 점수를 구성하는 각 근거를 하나씩 풀어봅니다. 합(合)·충(沖)·생(生)·극(剋) 같은 전통 명리 용어가 등장하지만, 쉽게 설명했으니 천천히 읽어보세요.',
                'Below is a breakdown of each scoring factor. Classical saju terms like harmony, clash, and nourishment appear, but each is explained in plain language — take your time reading through.'
              )}
            </p>
            {insights.reasonDetails.map((d, i) => {
              const reason = match.reasons.find((r) => r.code === d.code);
              if (!reason) return null;
              const positive = reason.points > 0;
              return (
                <div key={i} className="border-b border-gray-100 dark:border-gray-800 pb-4 last:border-b-0 last:pb-0">
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[13.5px] font-bold text-gray-800 dark:text-gray-100">
                      {reason.label}
                    </span>
                    <span
                      className={`text-[11px] font-bold px-1.5 py-0.5 rounded-md ${
                        positive
                          ? 'bg-pink-50 dark:bg-pink-950/40 text-pink-700 dark:text-pink-300'
                          : reason.points === 0
                            ? 'bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400'
                            : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300'
                      }`}
                    >
                      {reason.points > 0 ? `+${reason.points}` : reason.points}
                    </span>
                  </div>
                  <p className="text-[13.5px] text-gray-700 dark:text-gray-200 leading-[1.8]">
                    {lang === 'en' ? d.en : d.ko}
                  </p>
                </div>
              );
            })}
          </div>
        </ToggleSection>
      )}

      {/* 5. 관계 팁 — 기본 접힘, 서술형 실천 조언 */}
      {insights.tips.length > 0 && (
        <ToggleSection
          title={t('이 관계를 위한 팁', 'Tips for this pairing')}
          subtitle={insights.tips[0] ? firstLine(lang === 'en' ? insights.tips[0].en : insights.tips[0].ko) : undefined}
          titleClassName="text-[15px] font-bold text-pink-700 dark:text-pink-300 tracking-wide"
          defaultOpen={false}
        >
          <div className="space-y-3">
            <p className="text-[13px] text-gray-500 dark:text-gray-400 leading-[1.7]">
              {t(
                '궁합 분석 결과를 바탕으로, 이 조합에서 특히 효과가 큰 실천 팁을 정리했습니다. 한꺼번에 다 하려 하기보다 하나씩 시도해보세요.',
                'Based on the match analysis, here are practical tips especially effective for this pairing. Try them one at a time rather than all at once.'
              )}
            </p>
            {insights.tips.map((tip, i) => (
              <div key={i} className="bg-pink-50/40 dark:bg-pink-950/20 rounded-lg p-3.5">
                <p className="text-[13.5px] text-gray-800 dark:text-gray-100 leading-[1.8]">
                  <span className="text-pink-500 dark:text-pink-400 font-bold mr-1.5">{i + 1}.</span>
                  {lang === 'en' ? tip.en : tip.ko}
                </p>
              </div>
            ))}
          </div>
        </ToggleSection>
      )}

      <p className="text-[10.5px] text-gray-400 dark:text-gray-500 leading-snug px-1">
        {t(
          '일간 관계 · 일지 합충 · 오행 보완 · 배우자궁 일치 · 연령차를 종합한 해석입니다. 재미로 참고해주세요.',
          'A combined reading of day stem relation, branch harmony/clash, element complement, spouse star, and age gap. For entertainment only.'
        )}
      </p>

      {onReset && (
        <button
          type="button"
          onClick={onReset}
          className="w-full py-2.5 text-[13px] text-gray-500 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 rounded-xl hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors border-none cursor-pointer"
        >
          {t('다시 입력하기', 'Enter again')}
        </button>
      )}
    </div>
  );
}

/** SajuTable 디자인 시스템 — 두 사람 좌우 한 행 배치 (데스크탑) / 위아래 (모바일) */
const EL_CELL: Record<string, string> = {
  '목': 'bg-[#34D399] text-white',
  '화': 'bg-[#FD0002] text-white',
  '토': 'bg-[#EDCE01] text-gray-900',
  '금': 'bg-[#EAEAEA] text-gray-700',
  '수': 'bg-[#000000] text-white',
};

interface CouplePillarRowProps {
  aLabel: string;
  bLabel: string;
  aPillars: Pillar[];
  bPillars: Pillar[];
  aIlgan: string;
  bIlgan: string;
}

/** 한 사람 4주 테이블 (모바일 스택용) */
function SinglePillarTable({ label, pillars, ilgan, labelColor }: {
  label: string; pillars: Pillar[]; ilgan: string; labelColor: string;
}) {
  const { t } = useLang();
  const headers = [t('시주', 'H'), t('일주', 'D'), t('월주', 'M'), t('연주', 'Y')];
  return (
    <div>
      <div className={`text-[11px] font-bold ${labelColor} mb-1`}>{label}</div>
      <table className="w-full border-separate border-spacing-x-[3px] border-spacing-y-0 text-center text-[12px]">
        <thead>
          <tr>
            {headers.map((h, i) => (
              <th key={i} className="pb-0.5 text-[9px] text-gray-400 font-medium">{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            {pillars.map((p, i) => (
              <td key={`c-${i}`} className={`py-3 px-1 rounded-md ${p.c ? EL_CELL[p.co] || '' : ''}`}>
                {p.c ? <span className="text-[18px] font-bold">{p.ck}{p.c}</span> : <span className="text-gray-300">—</span>}
              </td>
            ))}
          </tr>
          <tr>
            {pillars.map((p, i) => (
              <td key={`cs-${i}`} className="py-0.5 text-[10px] text-gray-500">{p.c ? sipsung(ilgan, p.c) : ''}</td>
            ))}
          </tr>
          <tr>
            {pillars.map((p, i) => (
              <td key={`j-${i}`} className={`py-3 px-1 rounded-md ${p.j ? EL_CELL[p.jo] || '' : ''}`}>
                {p.j ? <span className="text-[18px] font-bold">{p.jk}{p.j}</span> : <span className="text-gray-300">—</span>}
              </td>
            ))}
          </tr>
          <tr>
            {pillars.map((p, i) => {
              const g = p.j && JJG[p.j];
              return <td key={`js-${i}`} className="py-0.5 text-[10px] text-gray-500">{g ? sipsung(ilgan, g[g.length - 1]) : ''}</td>;
            })}
          </tr>
          <tr>
            {pillars.map((p, i) => {
              const g = p.j && JJG[p.j];
              return (
                <td key={`jg-${i}`} className="py-0.5">
                  {g ? <span className="text-[9px] text-gray-400">{g.join(' ')}</span> : null}
                </td>
              );
            })}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function CouplePillarRow({ aLabel, bLabel, aPillars, bPillars, aIlgan, bIlgan }: CouplePillarRowProps) {
  const { t } = useLang();
  const headers = [t('시주', 'H'), t('일주', 'D'), t('월주', 'M'), t('연주', 'Y')];

  return (
    <div className="mb-3">
      {/* 모바일: 위아래 스택 */}
      <div className="md:hidden space-y-3">
        <SinglePillarTable label={aLabel} pillars={aPillars} ilgan={aIlgan} labelColor="text-pink-600 dark:text-pink-400" />
        <div className="flex items-center gap-2">
          <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
          <span className="text-[13px] text-pink-400 dark:text-pink-300 font-bold">♥</span>
          <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
        </div>
        <SinglePillarTable label={bLabel} pillars={bPillars} ilgan={bIlgan} labelColor="text-blue-600 dark:text-blue-400" />
      </div>

      {/* 데스크탑: 좌우 한 행 */}
      <div className="hidden md:block overflow-x-auto -mx-2">
        <table className="w-full border-separate border-spacing-x-[2px] border-spacing-y-0 text-center text-[11px] min-w-[480px]">
          <thead>
            <tr>
              {headers.map((h, i) => (
                <th key={`ah-${i}`} className="pb-0.5 text-[9px] text-gray-400 font-medium">{h}</th>
              ))}
              <th className="w-[3px]" />
              {headers.map((h, i) => (
                <th key={`bh-${i}`} className="pb-0.5 text-[9px] text-gray-400 font-medium">{h}</th>
              ))}
            </tr>
            <tr>
              <th colSpan={4} className="text-[10px] font-bold text-pink-600 dark:text-pink-400 pb-1">{aLabel}</th>
              <th className="w-[3px]" />
              <th colSpan={4} className="text-[10px] font-bold text-blue-600 dark:text-blue-400 pb-1">{bLabel}</th>
            </tr>
          </thead>
          <tbody>
            {/* 천간 */}
            <tr>
              {aPillars.map((p, i) => (
                <td key={`ac-${i}`} className={`py-2.5 px-1 rounded-md ${p.c ? EL_CELL[p.co] || '' : ''}`}>
                  {p.c ? <span className="text-[16px] font-bold whitespace-nowrap">{p.ck}{p.c}</span> : <span className="text-gray-300">—</span>}
                </td>
              ))}
              <td className="bg-gray-200 dark:bg-gray-600 w-[3px]" />
              {bPillars.map((p, i) => (
                <td key={`bc-${i}`} className={`py-2.5 px-1 rounded-md ${p.c ? EL_CELL[p.co] || '' : ''}`}>
                  {p.c ? <span className="text-[16px] font-bold whitespace-nowrap">{p.ck}{p.c}</span> : <span className="text-gray-300">—</span>}
                </td>
              ))}
            </tr>
            {/* 천간 십성 */}
            <tr>
              {aPillars.map((p, i) => (
                <td key={`as-${i}`} className="py-0.5 text-[9px] text-gray-500">{p.c ? sipsung(aIlgan, p.c) : ''}</td>
              ))}
              <td />
              {bPillars.map((p, i) => (
                <td key={`bs-${i}`} className="py-0.5 text-[9px] text-gray-500">{p.c ? sipsung(bIlgan, p.c) : ''}</td>
              ))}
            </tr>
            {/* 지지 */}
            <tr>
              {aPillars.map((p, i) => (
                <td key={`aj-${i}`} className={`py-2.5 px-1 rounded-md ${p.j ? EL_CELL[p.jo] || '' : ''}`}>
                  {p.j ? <span className="text-[16px] font-bold whitespace-nowrap">{p.jk}{p.j}</span> : <span className="text-gray-300">—</span>}
                </td>
              ))}
              <td className="bg-gray-200 dark:bg-gray-600 w-[3px]" />
              {bPillars.map((p, i) => (
                <td key={`bj-${i}`} className={`py-2.5 px-1 rounded-md ${p.j ? EL_CELL[p.jo] || '' : ''}`}>
                  {p.j ? <span className="text-[16px] font-bold whitespace-nowrap">{p.jk}{p.j}</span> : <span className="text-gray-300">—</span>}
                </td>
              ))}
            </tr>
            {/* 지지 십성 */}
            <tr>
              {aPillars.map((p, i) => {
                const g = p.j && JJG[p.j];
                return <td key={`ajs-${i}`} className="py-0.5 text-[9px] text-gray-500">{g ? sipsung(aIlgan, g[g.length - 1]) : ''}</td>;
              })}
              <td />
              {bPillars.map((p, i) => {
                const g = p.j && JJG[p.j];
                return <td key={`bjs-${i}`} className="py-0.5 text-[9px] text-gray-500">{g ? sipsung(bIlgan, g[g.length - 1]) : ''}</td>;
              })}
            </tr>
            {/* 지장간 */}
            <tr>
              {aPillars.map((p, i) => {
                const g = p.j && JJG[p.j];
                return (
                  <td key={`ag-${i}`} className="py-0.5">
                    {g ? <span className="text-[8px] text-gray-400">{g.join(' ')}</span> : null}
                  </td>
                );
              })}
              <td />
              {bPillars.map((p, i) => {
                const g = p.j && JJG[p.j];
                return (
                  <td key={`bg-${i}`} className="py-0.5">
                    {g ? <span className="text-[8px] text-gray-400">{g.join(' ')}</span> : null}
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** 오행 상생상극 원형 다이어그램 — 두 사람 위치 표시 */
const OH_POSITIONS: Record<Oh, { x: number; y: number }> = {
  '목': { x: 95, y: 20 },   // top-right
  '화': { x: 150, y: 75 },  // right
  '토': { x: 125, y: 145 }, // bottom-right
  '금': { x: 55, y: 145 },  // bottom-left
  '수': { x: 30, y: 75 },   // left
};

const OH_LABEL: Record<Oh, string> = { '목': '木', '화': '火', '토': '土', '금': '金', '수': '水' };
const OH_SVG_COLOR: Record<Oh, string> = {
  '목': '#34D399', '화': '#FD0002', '토': '#EDCE01', '금': '#9CA3AF', '수': '#3B82F6',
};

const SAENG_ORDER: Oh[] = ['목', '화', '토', '금', '수'];

function OhaengDiagram({ aOh, bOh, t, lang }: { aOh: Oh; bOh: Oh; t: (ko: string, en: string) => string; lang: string }) {
  // 두 오행 사이 관계 판정
  let relation: 'saeng' | 'geuk' | 'same' | 'neutral' = 'neutral';
  let relationLabel = '';
  if (aOh === bOh) {
    relation = 'same';
    relationLabel = t('동일 오행', 'Same Element');
  } else if (OH_SAENG[aOh] === bOh || OH_SAENG[bOh] === aOh) {
    relation = 'saeng';
    relationLabel = t('상생 관계', 'Nourishing');
  } else if (OH_GEUK[aOh] === bOh || OH_GEUK[bOh] === aOh) {
    relation = 'geuk';
    relationLabel = t('상극 관계', 'Controlling');
  } else {
    relationLabel = t('간접 관계', 'Indirect');
  }

  const aPos = OH_POSITIONS[aOh];
  const bPos = OH_POSITIONS[bOh];

  return (
    <div className="bg-white dark:bg-gray-900 shadow-[0_1px_4px_rgba(0,0,0,0.06)] rounded-[16px] p-4">
      <div className="text-[11px] font-bold text-gray-500 dark:text-gray-400 mb-2 tracking-wide">
        {t('오행 관계도', 'Element Diagram')}
      </div>
      <div className="flex items-center justify-center">
        <svg viewBox="0 0 180 170" className="w-[200px] h-[190px]">
          {/* 상생 화살표 (순환) */}
          {SAENG_ORDER.map((oh, i) => {
            const next = SAENG_ORDER[(i + 1) % 5];
            const from = OH_POSITIONS[oh];
            const to = OH_POSITIONS[next];
            return (
              <line
                key={`saeng-${i}`}
                x1={from.x} y1={from.y} x2={to.x} y2={to.y}
                stroke="#D1D5DB" strokeWidth="1" strokeDasharray="3,3" opacity={0.6}
              />
            );
          })}
          {/* 두 사람 연결선 */}
          {aOh !== bOh && (
            <line
              x1={aPos.x} y1={aPos.y} x2={bPos.x} y2={bPos.y}
              stroke={relation === 'saeng' ? '#10B981' : relation === 'geuk' ? '#EF4444' : '#9CA3AF'}
              strokeWidth="2.5"
              strokeLinecap="round"
            />
          )}
          {/* 5개 오행 노드 */}
          {SAENG_ORDER.map((oh) => {
            const pos = OH_POSITIONS[oh];
            const isA = oh === aOh;
            const isB = oh === bOh;
            const r = (isA || isB) ? 16 : 12;
            return (
              <g key={oh}>
                <circle
                  cx={pos.x} cy={pos.y} r={r}
                  fill={OH_SVG_COLOR[oh]}
                  opacity={(isA || isB) ? 1 : 0.3}
                  stroke={(isA || isB) ? '#1F2937' : 'none'}
                  strokeWidth={1.5}
                />
                <text
                  x={pos.x} y={pos.y + 1}
                  textAnchor="middle" dominantBaseline="central"
                  fontSize={(isA || isB) ? 11 : 9}
                  fontWeight="bold"
                  fill={(oh === '토' || oh === '금') ? '#1F2937' : '#FFFFFF'}
                >
                  {OH_LABEL[oh]}
                </text>
                {/* 나/상대 표시 */}
                {isA && (
                  <text x={pos.x} y={pos.y - r - 4} textAnchor="middle" fontSize="8" fill="#EC4899" fontWeight="bold">
                    {t('나', 'Me')}
                  </text>
                )}
                {isB && !isA && (
                  <text x={pos.x} y={pos.y - r - 4} textAnchor="middle" fontSize="8" fill="#3B82F6" fontWeight="bold">
                    {t('상대', 'P')}
                  </text>
                )}
                {isA && isB && (
                  <text x={pos.x} y={pos.y + r + 10} textAnchor="middle" fontSize="7" fill="#6B7280">
                    {t('동일', 'Same')}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
      {/* 관계 라벨 */}
      <div className="text-center mt-1">
        <span className={`text-[12px] font-bold ${
          relation === 'saeng' ? 'text-emerald-600 dark:text-emerald-400'
          : relation === 'geuk' ? 'text-red-600 dark:text-red-400'
          : 'text-gray-500 dark:text-gray-400'
        }`}>
          {aOh === bOh ? `${OH_LABEL[aOh]} = ${OH_LABEL[bOh]}` : `${OH_LABEL[aOh]} → ${OH_LABEL[bOh]}`} {relationLabel}
        </span>
      </div>
    </div>
  );
}
