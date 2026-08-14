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
} from '@saju/features/fortune/lib/engine';
import {
  STEM_HAP, BRANCH_SAMHAP, BRANCH_YUKHAP, BRANCH_CHUNG,
  OH_SAENG, OH_GEUK, OH_GEUK_REV,
  FIT_MATRIX,
  type Oh,
} from '@saju/features/ideal-match/lib/personaDictionary';

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
  /** 캐치한 궁합 유형 태그 */
  typeName: { ko: string; en: string };
  /** 하위 카테고리별 점수 (0~10) */
  categoryScores: {
    romance: number;      // 연애운 (끌림·감정)
    communication: number; // 소통
    conflict: number;      // 갈등 해결
    stability: number;     // 결혼 안정성
  };
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

  // === 하위 카테고리 점수 계산 ===
  // 각 카테고리에 기여하는 근거 코드의 점수를 가중치로 분배
  const catBase = 5;
  const stemPts = reasons.find(r => ['stemHap', 'stemSaeng', 'stemGeuk', 'stemSame'].includes(r.code))?.points ?? 0;
  const branchPts = reasons.find(r => ['branchSamhap', 'branchYukhap', 'branchChung', 'branchSame'].includes(r.code))?.points ?? 0;
  const fillPts = reasons.find(r => r.code === 'elementFill')?.points ?? 0;
  const spousePts = reasons.filter(r => r.code === 'spouseMatch').reduce((s, r) => s + r.points, 0);
  const agePts = reasons.find(r => r.code === 'ageGap')?.points ?? 0;

  // 연애운: 일간 관계(감정 끌림) + 배우자성
  const romance = Math.max(0, Math.min(10, Math.round((catBase + stemPts * 0.8 + spousePts * 0.4) * 10) / 10));
  // 소통: 일간 관계(가치관) + 오행 보완
  const communication = Math.max(0, Math.min(10, Math.round((catBase + stemPts * 0.4 + fillPts * 0.6) * 10) / 10));
  // 갈등 해결: 일지 관계(생활 밀접도) + 연령차
  const conflict = Math.max(0, Math.min(10, Math.round((catBase + branchPts * 0.7 + agePts * 0.5) * 10) / 10));
  // 결혼 안정성: 오행 보완 + 일지 관계 + 배우자성
  const stability = Math.max(0, Math.min(10, Math.round((catBase + fillPts * 0.5 + branchPts * 0.4 + spousePts * 0.3) * 10) / 10));

  const categoryScores = { romance, communication, conflict, stability };

  // === 궁합 유형 태그 ===
  const typeName = getTypeTag(score, reasons, aOh, bOh);

  return {
    score,
    headline,
    typeName,
    categoryScores,
    reasons,
    a: { ilgan: aIlgan, ilji: aIlji, oh: aOh },
    b: { ilgan: bIlgan, ilji: bIlji, oh: bOh },
    strengths,
    cautions,
  };
}

/** 궁합 유형 캐치 네이밍 */
function getTypeTag(
  score: number,
  reasons: CoupleReason[],
  aOh: Oh,
  bOh: Oh,
): { ko: string; en: string } {
  const hasStemHap = reasons.some(r => r.code === 'stemHap');
  const hasBranchHap = reasons.some(r => r.code === 'branchSamhap' || r.code === 'branchYukhap');
  const hasStemGeuk = reasons.some(r => r.code === 'stemGeuk');
  const hasBranchChung = reasons.some(r => r.code === 'branchChung');
  const hasElementFill = reasons.some(r => r.code === 'elementFill');
  const hasSpouse = reasons.some(r => r.code === 'spouseMatch');

  if (hasStemHap && hasBranchHap) return { ko: '천생연분형', en: 'Destined Pair' };
  if (hasStemHap && hasSpouse) return { ko: '운명적 끌림형', en: 'Fated Attraction' };
  if (hasStemHap) return { ko: '불꽃 케미형', en: 'Spark Chemistry' };
  if (hasBranchHap && hasElementFill) return { ko: '티키타카 안정형', en: 'Steady Harmony' };
  if (hasBranchHap) return { ko: '일상 밀착형', en: 'Daily Fit' };
  if (hasElementFill && hasSpouse) return { ko: '퍼즐 완성형', en: 'Puzzle Complete' };
  if (hasElementFill) return { ko: '서로 채움형', en: 'Mutual Fill' };
  if (hasStemGeuk && hasBranchChung) return { ko: '극과 극 자극형', en: 'Polar Spark' };
  if (hasStemGeuk) return { ko: '밀당 긴장형', en: 'Push-Pull' };
  if (hasBranchChung) return { ko: '충돌 성장형', en: 'Clash & Grow' };
  if (aOh === bOh) return { ko: '동류 공감형', en: 'Kindred Spirits' };
  if (score >= 7) return { ko: '자연 조화형', en: 'Natural Balance' };
  if (score >= 5) return { ko: '노력 보상형', en: 'Effort Pays Off' };
  return { ko: '대화 필수형', en: 'Talk It Through' };
}
