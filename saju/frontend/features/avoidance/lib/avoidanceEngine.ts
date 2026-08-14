/**
 * 상극인연 역산 엔진 — 내 사주 → 피해야 할 상대 프로필
 *
 * 분석 레이어:
 *  1. 오행 상극 (나를 극하는 오행)
 *  2. 지지 충 (衝) — 정면 충돌
 *  3. 지지 형 (刑) — 자극과 스트레스
 *  4. 지지 파 (破) / 해 (害) — 은근한 갈등
 */

import type { Pillar } from '@saju/features/fortune/lib/engine';
import { CG_OH, JJ_OH } from '@saju/features/fortune/lib/engine';
import {
  OH_GEUK_REV, OH_TO_STEMS, BRANCH_CHUNG,
  BRANCH_PERSONA, STEM_PERSONA,
  type Oh,
} from '@saju/features/ideal-match/lib/personaDictionary';
import {
  BRANCH_HYUNG, BRANCH_PA, BRANCH_HAE,
  AVOID_FIRST_IMPRESSION,
  CONFLICT_MECHANISM,
  CONFLICT_SCENARIO,
  ENERGY_DRAIN,
  RED_FLAGS,
  COPING_ADVICE,
} from './avoidanceDictionary';
import type { AvoidanceResult, AvoidReasonCode } from '../types';

const OH_LIST: Oh[] = ['목', '화', '토', '금', '수'];

/** 양력 연도 → 연주 지지. 1900년 = 子년 기준 */
const YEAR_BRANCH_ORDER = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'];
function yearToBranch(y: number): string {
  const idx = ((y - 1900) % 12 + 12) % 12;
  return YEAR_BRANCH_ORDER[idx];
}

export function computeAvoidance(
  pillars: Pillar[],
  birthYear?: number,
): AvoidanceResult | null {
  const ilgan = pillars[1]?.c;
  const ilji = pillars[1]?.j;
  if (!ilgan || !CG_OH[ilgan]) return null;

  const myOh = CG_OH[ilgan] as Oh;

  // === 1. 가장 피해야 할 오행: 나를 극하는 오행 ===
  const avoidOh = OH_GEUK_REV[myOh]; // 나를 극하는 오행
  const avoidStems = OH_TO_STEMS[avoidOh];
  const pickedStem = avoidStems[0]; // 양간을 우선 선택

  // === 2. 지지 충·형·파·해 분석 ===
  const branchChung: string[] = [];
  const branchHyung: string[] = [];
  const branchPa: string[] = [];

  if (ilji) {
    const chung = BRANCH_CHUNG[ilji];
    if (chung) branchChung.push(chung);

    const hyung = BRANCH_HYUNG[ilji];
    if (hyung) branchHyung.push(...hyung);

    const pa = BRANCH_PA[ilji];
    if (pa) branchPa.push(pa);
  }

  // === 3. 주의할 띠 (충 > 형 > 파 순으로 위험도 높음) ===
  const avoidBranchSet = new Set([...branchChung, ...branchHyung, ...branchPa]);
  const avoidZodiacs = Array.from(avoidBranchSet)
    .map(b => BRANCH_PERSONA[b]?.zodiac)
    .filter((x): x is string => !!x);

  // === 4. 위험도 점수 산출 ===
  const scoreReasons: { code: AvoidReasonCode; label: string; points: number }[] = [];
  let rawScore = 0;

  // 오행 상극 (가장 기본)
  scoreReasons.push({ code: 'ohGeuk', label: `${avoidOh}이(가) 내 ${myOh}을(를) 극함`, points: 3 });
  rawScore += 3;

  // 충
  if (branchChung.length > 0) {
    const zodiac = BRANCH_PERSONA[branchChung[0]]?.zodiac || '';
    scoreReasons.push({ code: 'chung', label: `일지 충 (${zodiac})`, points: 4 });
    rawScore += 4;
  }

  // 형
  if (branchHyung.length > 0) {
    scoreReasons.push({ code: 'hyung', label: `일지 형 (자극·스트레스)`, points: 3 });
    rawScore += 3;
  }

  // 파
  if (branchPa.length > 0) {
    scoreReasons.push({ code: 'pa', label: `일지 파 (은근한 갈등)`, points: 2 });
    rawScore += 2;
  }

  // 최대 가능 점수: 3(상극) + 4(충) + 3(형) + 2(파) = 12
  const maxPossible = 12;
  const dangerScore = Math.min(10, Math.round((rawScore / maxPossible) * 10 * 10) / 10);

  // === 5. 주의할 생년 (동년배 ±7년) ===
  const avoidYears: { year: number; zodiac: string }[] = [];
  if (birthYear && avoidBranchSet.size > 0) {
    const minY = birthYear - 7;
    const maxY = birthYear + 7;
    for (let y = minY; y <= maxY; y++) {
      const yb = yearToBranch(y);
      if (avoidBranchSet.has(yb)) {
        const zodiac = BRANCH_PERSONA[yb]?.zodiac || '';
        if (zodiac) avoidYears.push({ year: y, zodiac });
      }
    }
  }

  // === 6. 태그 ===
  const tags: string[] = [];
  tags.push(`${avoidOh} 상극`);
  if (branchChung.length > 0) tags.push('충');
  if (branchHyung.length > 0) tags.push('형');
  if (avoidZodiacs[0]) tags.push(avoidZodiacs[0]);

  // === 7. 서술형 필드 조합 ===
  const stemP = STEM_PERSONA[pickedStem];
  const summary = stemP
    ? `${stemP.keyword} ${avoidOh} 기운의 사람이 당신과 가장 부딪혀요`
    : `${avoidOh} 기운이 강한 사람은 당신과 마찰이 생기기 쉬워요`;

  const firstImpression = AVOID_FIRST_IMPRESSION[pickedStem]
    || `${avoidOh} 기운이 강한 사람이에요. 처음엔 매력적으로 느껴질 수 있어요.`;

  const conflictMechanism = CONFLICT_MECHANISM[myOh]?.[avoidOh]
    || `${avoidOh}은(는) ${myOh}을(를) 극하는 관계예요. 서로의 기운이 충돌하는 구조입니다.`;

  const conflictScenario = CONFLICT_SCENARIO[myOh]?.[avoidOh]
    || '가치관이나 생활 방식의 차이가 반복적인 갈등으로 이어져요.';

  const energyDrain = ENERGY_DRAIN[myOh]?.[avoidOh]
    || '이 관계에서 에너지 소모가 크고, 자기다움을 잃기 쉬워요.';

  const redFlags = RED_FLAGS[myOh]?.[avoidOh]?.length
    ? RED_FLAGS[myOh][avoidOh]
    : [
        '대화 후 기분이 자주 가라앉을 때',
        '상대 눈치를 보며 자기 표현을 삼키게 될 때',
        '만나고 나면 피로감이 심할 때',
      ];

  const copingAdvice = COPING_ADVICE[myOh]?.[avoidOh]
    || '물리적·심리적 거리를 유지하고, 이 관계에서의 감정 소모를 줄이는 데 집중하세요. 모든 관계가 가까워야 하는 건 아니에요.';

  return {
    summary,
    tags,
    avoidStemOh: [avoidOh],
    avoidStem: pickedStem,
    avoidZodiacs,
    avoidYears,
    dangerScore,
    scoreReasons,
    firstImpression,
    conflictMechanism,
    conflictScenario,
    energyDrain,
    redFlags,
    copingAdvice,
    reasoning: {
      myOh,
      avoidOh,
      branchChung,
      branchHyung,
      branchPa,
    },
  };
}
