/**
 * 커플 궁합 엔진 — 두 사람의 원국을 비교해 실제 궁합 점수·근거를 산출.
 *
 * 평가 축:
 *  1) 일간 관계: 천간합(+5), 상생(+3), 상극/동주(-2~0) — 감정·끌림
 *  2) 일지 관계: 삼합(+4), 육합(+3), 충(-4), 형(-2) — 생활 밀접도
 *  3) 오행 보완: 한쪽의 부족 오행을 상대가 많이 가졌는가 (최대 +4)
 *  4) 배우자성 일치: 남(재성)/여(관성) 오행을 상대 일간이 제공 (+3)
 *  5) 연령차 보정: 7살 이상 차이 나면 -1 (소프트 패널티)
 *
 * 이론 최댓값 ≈ 16. 최종 점수는 10점 만점으로 환산.
 */

import {
  CG_OH, JJ_OH,
  calculateElementDistribution,
  type Pillar,
} from '@/features/fortune/lib/engine';
import {
  STEM_HAP, BRANCH_SAMHAP, BRANCH_YUKHAP, BRANCH_CHUNG,
  OH_SAENG, OH_GEUK, OH_GEUK_REV,
  FIT_MATRIX,
  type Oh,
} from '@/features/ideal-match/lib/personaDictionary';

export type Gender = '남' | '여' | '';

export interface PersonInput {
  pillars: Pillar[];
  gender: Gender;
  birthYear: number;
  label?: string; // '나' | '상대' 같은 표시용
}

export type CoupleReasonCode =
  | 'stemHap'        // 천간합
  | 'stemSaeng'      // 일간 상생
  | 'stemGeuk'       // 일간 상극
  | 'stemSame'       // 일간 동일 오행
  | 'branchSamhap'   // 일지 삼합
  | 'branchYukhap'   // 일지 육합
  | 'branchChung'    // 일지 충
  | 'branchSame'     // 일지 동일
  | 'elementFill'    // 상대가 내 부족 오행 제공
  | 'spouseMatch'    // 상대 일간이 내 배우자성과 일치
  | 'ageGap';        // 연령차 패널티

export interface CoupleReason {
  code: CoupleReasonCode;
  label: string;
  points: number; // 양수 / 음수 모두 가능
}

export interface CoupleMatch {
  /** 0~10 점수 */
  score: number;
  /** 카테고리별 요약 (한 줄씩) */
  headline: string;
  /** 근거 리스트 — 플러스/마이너스 모두 */
  reasons: CoupleReason[];
  /** 두 사람 원국 요약 */
  a: { ilgan: string; ilji: string; oh: Oh };
  b: { ilgan: string; ilji: string; oh: Oh };
  /** 잘 맞는 점 · 주의할 점 — 오행 매트릭스 기반 */
  strengths: string[];
  cautions: string[];
}

function normalizeDist(pillars: Pillar[]): Record<Oh, number> {
  const out: Record<Oh, number> = { 목: 0, 화: 0, 토: 0, 금: 0, 수: 0 };
  for (const p of pillars) {
    if (p?.c && CG_OH[p.c]) out[CG_OH[p.c] as Oh] += 1;
    if (p?.j && JJ_OH[p.j]) out[JJ_OH[p.j] as Oh] += 1;
  }
  return out;
}

export function computeCoupleMatch(
  A: PersonInput,
  B: PersonInput,
): CoupleMatch | null {
  const aIlgan = A.pillars[1]?.c;
  const aIlji = A.pillars[1]?.j;
  const bIlgan = B.pillars[1]?.c;
  const bIlji = B.pillars[1]?.j;
  if (!aIlgan || !aIlji || !bIlgan || !bIlji) return null;
  if (!CG_OH[aIlgan] || !CG_OH[bIlgan]) return null;

  const aOh = CG_OH[aIlgan] as Oh;
  const bOh = CG_OH[bIlgan] as Oh;

  const reasons: CoupleReason[] = [];
  let raw = 0;

  // === 1) 일간 관계 ===
  if (STEM_HAP[aIlgan] === bIlgan) {
    reasons.push({ code: 'stemHap', label: `천간합 ${aIlgan}·${bIlgan}`, points: 5 });
    raw += 5;
  } else if (OH_SAENG[aOh] === bOh || OH_SAENG[bOh] === aOh) {
    reasons.push({ code: 'stemSaeng', label: `일간 상생(${aOh}→${bOh})`, points: 3 });
    raw += 3;
  } else if (aOh === bOh) {
    reasons.push({ code: 'stemSame', label: `동일 오행 (${aOh})`, points: 1 });
    raw += 1;
  } else if (OH_GEUK[aOh] === bOh || OH_GEUK[bOh] === aOh) {
    reasons.push({ code: 'stemGeuk', label: `일간 상극 (${aOh}↔${bOh})`, points: -2 });
    raw -= 2;
  }

  // === 2) 일지 관계 ===
  if (BRANCH_SAMHAP[aIlji]?.includes(bIlji)) {
    reasons.push({ code: 'branchSamhap', label: `일지 삼합 ${aIlji}·${bIlji}`, points: 4 });
    raw += 4;
  } else if (BRANCH_YUKHAP[aIlji] === bIlji) {
    reasons.push({ code: 'branchYukhap', label: `일지 육합 ${aIlji}·${bIlji}`, points: 3 });
    raw += 3;
  } else if (BRANCH_CHUNG[aIlji] === bIlji) {
    reasons.push({ code: 'branchChung', label: `일지 충 ${aIlji}·${bIlji}`, points: -4 });
    raw -= 4;
  } else if (aIlji === bIlji) {
    reasons.push({ code: 'branchSame', label: `동일 일지 (${aIlji})`, points: 0 });
  }

  // === 3) 오행 보완 (쌍방, 상한 +4) ===
  const aDist = calculateElementDistribution(A.pillars);
  const bDist = calculateElementDistribution(B.pillars);
  const aLacking = new Set(aDist.lacking as Oh[]);
  const bLacking = new Set(bDist.lacking as Oh[]);
  const aNorm = normalizeDist(A.pillars);
  const bNorm = normalizeDist(B.pillars);

  let fillPoints = 0;
  for (const lo of aLacking) {
    if (bNorm[lo] >= 2) fillPoints += 2;
    else if (bNorm[lo] >= 1) fillPoints += 1;
  }
  for (const lo of bLacking) {
    if (aNorm[lo] >= 2) fillPoints += 2;
    else if (aNorm[lo] >= 1) fillPoints += 1;
  }
  if (fillPoints > 0) {
    const capped = Math.min(4, fillPoints);
    reasons.push({ code: 'elementFill', label: '오행 보완', points: capped });
    raw += capped;
  }

  // === 4) 배우자성 일치 ===
  //   남성: 재성(내가 극하는 오행)을 상대가 일간으로 갖고 있을 때
  //   여성: 관성(나를 극하는 오행)을 상대가 일간으로 갖고 있을 때
  const aSpouseOh: Oh | null =
    A.gender === '남' ? OH_GEUK[aOh] : A.gender === '여' ? OH_GEUK_REV[aOh] : null;
  const bSpouseOh: Oh | null =
    B.gender === '남' ? OH_GEUK[bOh] : B.gender === '여' ? OH_GEUK_REV[bOh] : null;
  if (aSpouseOh && aSpouseOh === bOh) {
    reasons.push({ code: 'spouseMatch', label: 'A의 배우자궁과 B 일간 일치', points: 3 });
    raw += 3;
  }
  if (bSpouseOh && bSpouseOh === aOh) {
    reasons.push({ code: 'spouseMatch', label: 'B의 배우자궁과 A 일간 일치', points: 3 });
    raw += 3;
  }

  // === 5) 연령차 보정 ===
  const gap = Math.abs(A.birthYear - B.birthYear);
  if (gap >= 10) {
    reasons.push({ code: 'ageGap', label: `연령차 ${gap}년`, points: -1 });
    raw -= 1;
  }

  // === 점수 환산 ===
  //  기준점 5.0 — 특별한 신호가 없는 평범한 커플은 중립.
  //  한 포인트당 ±0.5 기여. 최대 강점(천간합+삼합+오행보완+배우자성) ≈ raw 16 → 10.0 상한.
  //  최대 약점(상극+충+연령차) ≈ raw -7 → 1.5 근처.
  //  동일 오행 + 오행보완 1~2 정도의 평범한 조합은 6.0 언저리로 수렴.
  const BASELINE = 5;
  const score = Math.max(0, Math.min(10, Math.round((BASELINE + raw * 0.5) * 10) / 10));

  // === FIT_MATRIX 에서 강점/주의 라인 ===
  const fitCell = FIT_MATRIX[aOh]?.[bOh];
  const strengths = fitCell?.fit ? [...fitCell.fit] : [];
  const cautions = fitCell?.caution ? [...fitCell.caution] : [];

  // === Headline ===
  let headline = '';
  if (score >= 8.5) headline = '서로를 깊이 채워주는 조합';
  else if (score >= 7) headline = '자연스러운 끌림이 있는 조합';
  else if (score >= 5.5) headline = '평범하지만 무난한 조합';
  else if (score >= 4) headline = '서로의 결이 달라 이해가 필요한 조합';
  else if (score >= 2.5) headline = '맞춰가려면 노력이 필요한 조합';
  else headline = '갈등 요소가 크니 대화가 많이 필요한 조합';

  return {
    score,
    headline,
    reasons,
    a: { ilgan: aIlgan, ilji: aIlji, oh: aOh },
    b: { ilgan: bIlgan, ilji: bIlji, oh: bOh },
    strengths,
    cautions,
  };
}
