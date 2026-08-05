'use client';

import { useMemo } from 'react';
import { useLang } from '@/shared/lib/LangContext';
import {
  computeCoupleMatch,
  type PersonInput,
  type CoupleReasonCode,
} from '../lib/coupleEngine';
import { buildCoupleInsights } from '../lib/coupleInsights';

interface Props {
  a: PersonInput;
  b: PersonInput;
  onReset?: () => void;
}

const OH_EN: Record<string, string> = {
  '목': 'Wood', '화': 'Fire', '토': 'Earth', '금': 'Metal', '수': 'Water',
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
    en: 'You fill each other’s missing elements — the partnership stays balanced.',
  },
  spouseMatch: {
    ko: '한쪽의 배우자성 오행이 상대 일간과 일치 — 전통 명리에서 가장 이상적인 배우자 패턴.',
    en: 'One chart’s Spouse Star matches the other’s day stem — the classical ideal pairing.',
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

  const ohLabel = (oh: string) => (lang === 'en' ? OH_EN[oh] ?? oh : oh);
  const scoreColor =
    match.score >= 8 ? 'text-pink-600'
    : match.score >= 5 ? 'text-gray-900'
    : 'text-amber-700';

  // 가장 큰 기여 오행을 Hero 배경색으로 (A 일간 기준)
  const primaryOh = match.a.oh;

  return (
    <div className="space-y-3">
      {/* Hero */}
      <div className={`relative overflow-hidden rounded-[20px] bg-gradient-to-br ${EL_HERO_BG[primaryOh]} border border-gray-200`}>
        <div className="px-5 pt-5 pb-4">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <div className="text-[10.5px] font-bold tracking-[0.14em] text-gray-500 uppercase mb-1">
                {t('커플 궁합', 'Couple Match')}
              </div>
              <div className="text-[18px] font-extrabold text-gray-900 leading-[1.3] tracking-[-0.01em]">
                {match.headline}
              </div>
            </div>
            <div className="shrink-0 flex flex-col items-center">
              <div className="text-[11px] font-semibold text-gray-500">
                {t('궁합', 'Score')}
              </div>
              <div className={`text-[30px] font-black leading-none mt-0.5 ${scoreColor}`}>
                {match.score.toFixed(1)}
              </div>
              <div className="text-[10px] text-gray-400 mt-0.5">/ 10</div>
            </div>
          </div>

          {/* 두 사람 원국 요약 */}
          <div className="grid grid-cols-2 gap-2 mb-3">
            <div className="bg-white/80 rounded-xl p-3">
              <div className="text-[10px] font-bold text-gray-400 mb-0.5">{a.label ?? t('나', 'Me')}</div>
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[14px] font-bold ${EL_BADGE_SOLID[match.a.oh]}`}>
                  {match.a.ilgan}
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] text-gray-500 truncate">{a.birthYear}</div>
                  <div className="text-[12px] font-semibold truncate">
                    {match.a.ilji} · {ohLabel(match.a.oh)}
                  </div>
                </div>
              </div>
            </div>
            <div className="bg-white/80 rounded-xl p-3">
              <div className="text-[10px] font-bold text-gray-400 mb-0.5">{b.label ?? t('상대', 'Partner')}</div>
              <div className="flex items-center gap-2">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-[14px] font-bold ${EL_BADGE_SOLID[match.b.oh]}`}>
                  {match.b.ilgan}
                </div>
                <div className="min-w-0">
                  <div className="text-[11px] text-gray-500 truncate">{b.birthYear}</div>
                  <div className="text-[12px] font-semibold truncate">
                    {match.b.ilji} · {ohLabel(match.b.oh)}
                  </div>
                </div>
              </div>
            </div>
          </div>

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
                        ? 'bg-white/80 text-gray-700 border-gray-200'
                        : 'bg-amber-50 text-amber-800 border-amber-200'
                    }`}
                  >
                    {r.label}
                    <span className={positive ? 'text-pink-600 font-bold' : 'text-amber-600 font-bold'}>
                      {r.points > 0 ? `+${r.points}` : r.points}
                    </span>
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* 점수 해설 — 왜 이 점수인지 2~3문장으로 */}
      <div className="rounded-xl bg-white border border-gray-200 p-4">
        <div className="text-[12px] font-bold text-gray-500 mb-1.5 tracking-wide">
          {t('이 점수에 담긴 의미', 'What this score means')}
        </div>
        <p className="text-[13.5px] text-gray-800 leading-[1.65]">
          {lang === 'en' ? insights.narrative.en : insights.narrative.ko}
        </p>
      </div>

      {/* 잘 맞는 점 */}
      {match.strengths.length > 0 && (
        <div className="rounded-xl bg-green-50/60 border border-green-100 p-3.5">
          <div className="text-[12px] font-bold text-green-700 mb-1.5">
            ✓ {t('잘 맞는 점', 'Strengths')}
          </div>
          <ul className="space-y-1.5">
            {match.strengths.map((s, i) => (
              <li key={i} className="text-[13px] text-gray-700 leading-relaxed">
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 주의할 점 */}
      {match.cautions.length > 0 && (
        <div className="rounded-xl bg-amber-50/60 border border-amber-100 p-3.5">
          <div className="text-[12px] font-bold text-amber-700 mb-1.5">
            ⚠ {t('주의할 점', 'Watch out')}
          </div>
          <ul className="space-y-1.5">
            {match.cautions.map((c, i) => (
              <li key={i} className="text-[13px] text-gray-700 leading-relaxed">
                {c}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* 근거 자세히 보기 — 각 점수 근거별 긴 설명 (항상 펼쳐짐) */}
      {insights.reasonDetails.length > 0 && (
        <div className="rounded-xl bg-white border border-gray-200 p-4">
          <div className="text-[12px] font-bold text-gray-500 mb-3 tracking-wide">
            {t('근거 자세히 보기', 'See the reasoning')}
            <span className="ml-1.5 text-[11px] text-gray-400 font-medium">
              ({insights.reasonDetails.length})
            </span>
          </div>
          <div className="space-y-3">
            {insights.reasonDetails.map((d, i) => {
              const reason = match.reasons.find((r) => r.code === d.code);
              if (!reason) return null;
              const positive = reason.points > 0;
              return (
                <div key={i}>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[12.5px] font-bold text-gray-800">
                      {reason.label}
                    </span>
                    <span
                      className={`text-[11px] font-bold px-1.5 py-0.5 rounded-md ${
                        positive
                          ? 'bg-pink-50 text-pink-700'
                          : reason.points === 0
                            ? 'bg-gray-100 text-gray-500'
                            : 'bg-amber-50 text-amber-700'
                      }`}
                    >
                      {reason.points > 0 ? `+${reason.points}` : reason.points}
                    </span>
                  </div>
                  <p className="text-[12.5px] text-gray-600 leading-[1.65]">
                    {lang === 'en' ? d.en : d.ko}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 관계 팁 — 조합 특성에 맞춘 실천 항목 */}
      {insights.tips.length > 0 && (
        <div className="rounded-xl bg-pink-50/50 border border-pink-100 p-3.5">
          <div className="text-[12px] font-bold text-pink-700 mb-2 tracking-wide">
            💡 {t('이 관계를 위한 팁', 'Tips for this pairing')}
          </div>
          <ul className="space-y-2">
            {insights.tips.map((tip, i) => (
              <li
                key={i}
                className="text-[12.5px] text-gray-700 leading-[1.65] flex gap-2"
              >
                <span className="shrink-0 text-pink-500 font-bold">
                  {i + 1}.
                </span>
                <span>{lang === 'en' ? tip.en : tip.ko}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-[10.5px] text-gray-400 leading-snug px-1">
        {t(
          '일간 관계 · 일지 합충 · 오행 보완 · 배우자궁 일치 · 연령차를 종합한 해석입니다. 재미로 참고해주세요.',
          'A combined reading of day stem relation, branch harmony/clash, element complement, spouse star, and age gap. For entertainment only.'
        )}
      </p>

      {onReset && (
        <button
          type="button"
          onClick={onReset}
          className="w-full py-2.5 text-[13px] text-gray-500 bg-gray-100 rounded-xl hover:bg-gray-200 transition-colors border-none cursor-pointer"
        >
          {t('다시 입력하기', 'Enter again')}
        </button>
      )}
    </div>
  );
}
