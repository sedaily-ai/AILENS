/**
 * 이상형 사주 역산 엔진 — 내 사주(+선택적 성별) → 어울리는 상대 프로필
 *
 * 4개 레이어로 추천 일간/일지를 도출:
 *  1. 오행 보완 (부족 오행 채움)
 *  2. 천간합 (일간 유정)
 *  3. 지지 삼합·육합 (일지 조화)
 *  4. 배우자성 보완 (여: 관성 / 남: 재성) — 성별 있을 때만
 */

import type { Pillar } from '@/features/fortune/lib/engine';
import { CG_OH, JJ_OH, calculateElementDistribution } from '@/features/fortune/lib/engine';
import {
  STEM_PERSONA, BRANCH_PERSONA, FIT_MATRIX, OH_TO_STEMS,
  STEM_HAP, BRANCH_SAMHAP, BRANCH_YUKHAP, BRANCH_CHUNG,
  OH_GEUK, OH_GEUK_REV,
  type Oh,
} from './personaDictionary';
import type { IdealMatch, ReasonCode } from '../types';

export type Gender = '남' | '여' | '';
/**
 * 매칭 가중치 모드
 *  - 'spouse': 배우자궁(관성·재성) + 천간합 우선 → '현실적으로 잘 만나는 상대'
 *  - 'element': 오행 보완 우선 → '부족한 오행을 채워주는 상대'
 */
export type MatchMode = 'spouse' | 'element';

const OH_LIST: Oh[] = ['목', '화', '토', '금', '수'];

/** 양력 연도 → 연주 지지. 1900년 = 子년 기준 (year - 1900) % 12 */
const YEAR_BRANCH_ORDER_FROM_1900 = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
function yearToBranch(y: number): string {
  const idx = ((y - 1900) % 12 + 12) % 12;
  return YEAR_BRANCH_ORDER_FROM_1900[idx];
}

/** 월지(月支) → 양력 월 대략 매핑 (절기 기준 단순화, 寅=2월) */
const BRANCH_TO_MONTH: Record<string, number> = {
  '寅': 2, '卯': 3, '辰': 4, '巳': 5, '午': 6, '未': 7,
  '申': 8, '酉': 9, '戌': 10, '亥': 11, '子': 12, '丑': 1,
};

/** 오행 득표 집계로 후보 오행 선정 */
function pickTopOh(scores: Record<Oh, number>): Oh[] {
  const sorted = OH_LIST.map(o => ({ o, s: scores[o] }))
    .sort((a, b) => b.s - a.s)
    .filter(x => x.s > 0);
  return sorted.map(x => x.o);
}

export function computeIdealMatch(
  pillars: Pillar[],
  gender: Gender = '',
  birthYear?: number,
  mode: MatchMode = 'spouse',
): IdealMatch | null {
  const ilgan = pillars[1]?.c;
  const ilji = pillars[1]?.j;
  if (!ilgan || !CG_OH[ilgan]) return null;

  const myOh = CG_OH[ilgan] as Oh;
  const dist = calculateElementDistribution(pillars);

  // === 1. 후보 오행 득표 계산 (mode 별 가중치) ===
  const scores: Record<Oh, number> = { 목: 0, 화: 0, 토: 0, 금: 0, 수: 0 };

  // mode 별 가중치 테이블
  //  spouse:  배우자궁/천간합을 크게 → "현실적으로 잘 만나는 상대"
  //  element: 오행 보완/과잉 통제를 크게 → "부족한 오행을 채워주는 상대"
  const W = mode === 'spouse'
    ? { lacking: 2, excess: 1, hap: 4, spouse: 4 }
    : { lacking: 5, excess: 3, hap: 2, spouse: 1 };

  // (1) 부족 오행
  for (const lo of dist.lacking) {
    if (OH_LIST.includes(lo as Oh)) scores[lo as Oh] += W.lacking;
  }
  // (2) 과다 오행을 극하는 오행
  for (const ex of dist.excess) {
    if (OH_LIST.includes(ex as Oh)) {
      const controller = OH_GEUK_REV[ex as Oh];
      scores[controller] += W.excess;
    }
  }
  // (3) 천간합 상대 오행
  const hapStem = STEM_HAP[ilgan];
  if (hapStem) scores[CG_OH[hapStem] as Oh] += W.hap;

  // (4) 배우자성 오행 (성별 의존)
  if (gender === '여') {
    scores[OH_GEUK_REV[myOh]] += W.spouse;
  } else if (gender === '남') {
    scores[OH_GEUK[myOh]] += W.spouse;
  }

  // 후보가 하나도 없으면 일간합 오행 fallback
  let ranked = pickTopOh(scores);
  if (ranked.length === 0 && hapStem) ranked = [CG_OH[hapStem] as Oh];
  if (ranked.length === 0) ranked = [OH_GEUK_REV[myOh]]; // 최후 fallback

  const primaryOh = ranked[0];
  const secondaryOh = ranked[1];

  // === 2. 추천 일간 후보 ===
  const primaryStems = OH_TO_STEMS[primaryOh];
  // 천간합 상대가 primary 오행에 속하면 그걸 우선
  const pickedStem = hapStem && primaryStems.includes(hapStem) ? hapStem : primaryStems[0];

  // === 3. 추천 일지(띠) & 주의할 띠 ===
  const idealBranches: string[] = [];
  const avoidBranches: string[] = [];
  if (ilji) {
    // 삼합
    const sam = BRANCH_SAMHAP[ilji] || [];
    idealBranches.push(...sam);
    // 육합
    const yuk = BRANCH_YUKHAP[ilji];
    if (yuk) idealBranches.push(yuk);
    // 충
    const chung = BRANCH_CHUNG[ilji];
    if (chung) avoidBranches.push(chung);
  }
  const uniqueIdealBranches = Array.from(new Set(idealBranches)).slice(0, 3);
  const uniqueAvoidBranches = Array.from(new Set(avoidBranches));

  // === 4. 문구 조립 ===
  const stemP = STEM_PERSONA[pickedStem];
  const fitCell = FIT_MATRIX[myOh]?.[primaryOh];

  const tags: string[] = [];
  tags.push(`${primaryOh} 일간`);
  if (stemP) tags.push(stemP.keyword);
  if (uniqueIdealBranches[0]) {
    const bp = BRANCH_PERSONA[uniqueIdealBranches[0]];
    if (bp) tags.push(bp.zodiac);
  }
  if (secondaryOh && secondaryOh !== primaryOh) tags.push(`${secondaryOh} 보완`);

  const summary = stemP
    ? `${stemP.keyword} ${primaryOh} 기운의 파트너가 당신과 잘 어울려요`
    : `${primaryOh} 기운이 강한 파트너가 잘 어울려요`;

  const appearance = stemP ? [...stemP.appearance] : [];
  const personality = stemP ? [...stemP.personality] : [];

  // 일지 분위기 한 줄 추가
  if (uniqueIdealBranches[0]) {
    const bp = BRANCH_PERSONA[uniqueIdealBranches[0]];
    if (bp) personality.push(`${bp.zodiac} 느낌의 ${bp.mood}`);
  }

  const strengths = (fitCell?.fit || []).map((desc, i) => ({
    title: i === 0 ? '잘 맞는 점' : '추가로 어울리는 점',
    desc,
  }));
  // 배우자성 보완 멘트
  if (gender === '여' && primaryOh === OH_GEUK_REV[myOh]) {
    strengths.push({
      title: '관계에서의 역할',
      desc: '당신에게 기준과 방향을 제시해주는 듬직한 상대',
    });
  } else if (gender === '남' && primaryOh === OH_GEUK[myOh]) {
    strengths.push({
      title: '관계에서의 역할',
      desc: '당신의 현실 감각을 깨워주고 실속을 더해주는 상대',
    });
  }

  const cautions = (fitCell?.caution || []).map((desc, i) => ({
    title: i === 0 ? '주의할 점' : '또 하나 주의할 점',
    desc,
  }));

  // 추천 띠 라벨
  const idealZodiacs = uniqueIdealBranches
    .map(b => BRANCH_PERSONA[b]?.zodiac)
    .filter((x): x is string => !!x);
  const avoidZodiacs = uniqueAvoidBranches
    .map(b => BRANCH_PERSONA[b]?.zodiac)
    .filter((x): x is string => !!x);

  // === 5. 점수 산출 ===
  const scoreReasons: { code: ReasonCode; label: string; points: number }[] = [];
  const primaryScore = scores[primaryOh] || 0;
  if (dist.lacking.includes(primaryOh)) {
    scoreReasons.push({ code: 'lacking', label: `부족한 ${primaryOh} 기운을 채워줌`, points: W.lacking });
  }
  if (dist.excess.length > 0) {
    const excessControlled = dist.excess.filter(
      (ex): ex is Oh => OH_LIST.includes(ex as Oh) && OH_GEUK_REV[ex as Oh] === primaryOh,
    );
    if (excessControlled.length > 0) {
      scoreReasons.push({ code: 'excess', label: `몰려있는 ${excessControlled[0]} 기운을 눌러줌`, points: W.excess });
    }
  }
  if (hapStem && CG_OH[hapStem] === primaryOh) {
    scoreReasons.push({ code: 'stemHap', label: '자연스럽게 끌리는 타입', points: W.hap });
  }
  if (gender === '여' && OH_GEUK_REV[myOh] === primaryOh) {
    scoreReasons.push({ code: 'spouseGwan', label: '전통적 "배우자 자리"와 일치', points: W.spouse });
  } else if (gender === '남' && OH_GEUK[myOh] === primaryOh) {
    scoreReasons.push({ code: 'spouseJae', label: '전통적 "배우자 자리"와 일치', points: W.spouse });
  }
  let branchBonus = 0;
  if (uniqueIdealBranches.length > 0 && ilji) {
    if (BRANCH_SAMHAP[ilji]?.some(b => uniqueIdealBranches.includes(b))) {
      scoreReasons.push({ code: 'samhap', label: '띠끼리 "세 동물 한 팀"', points: 2 });
      branchBonus = 2;
    } else if (BRANCH_YUKHAP[ilji] && uniqueIdealBranches.includes(BRANCH_YUKHAP[ilji])) {
      scoreReasons.push({ code: 'yukhap', label: '띠끼리 "짝꿍"', points: 1 });
      branchBonus = 1;
    }
  }
  // 이론 최댓값 = W.lacking + W.excess + W.hap + W.spouse + 2(삼합)
  const maxPossible = W.lacking + W.excess + W.hap + W.spouse + 2;
  const rawScore = primaryScore + branchBonus;
  const score = Math.min(10, Math.round((rawScore / maxPossible) * 10 * 10) / 10);

  // === 6. 추천 생년 (동년배 ±7년) ===
  const idealYears: { year: number; zodiac: string }[] = [];
  if (birthYear && uniqueIdealBranches.length > 0) {
    const minY = birthYear - 7;
    const maxY = birthYear + 7;
    for (let y = minY; y <= maxY; y++) {
      const yb = yearToBranch(y);
      if (uniqueIdealBranches.includes(yb)) {
        const zodiac = BRANCH_PERSONA[yb]?.zodiac || '';
        if (zodiac) idealYears.push({ year: y, zodiac });
      }
    }
  }

  // === 7. 추천 생월 (추천 일지 → 양력 월 매핑) ===
  const idealMonths = Array.from(
    new Set(
      uniqueIdealBranches
        .map(b => BRANCH_TO_MONTH[b])
        .filter((m): m is number => typeof m === 'number'),
    ),
  ).sort((a, b) => a - b);

  return {
    summary,
    tags,
    idealStemOh: secondaryOh ? [primaryOh, secondaryOh] : [primaryOh],
    idealZodiacs,
    avoidZodiacs,
    idealYears,
    idealMonths,
    appearance,
    personality,
    strengths,
    cautions,
    score,
    scoreReasons,
    reasoning: {
      lackingOh: dist.lacking,
      excessOh: dist.excess,
      stemHap: hapStem,
      branchHap: uniqueIdealBranches,
      branchChung: uniqueAvoidBranches,
    },
  };
}
