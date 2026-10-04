import type { GlanceId, MomentId } from './moments';

// 결과 화면 "다른 분들은 어떻게 볼까요" 분포 — ⚠️ 샘플 데이터(목업)다(2026-10-04).
// 아직 서버 집계가 없어서 그럴듯한 값을 손으로 넣었다. 실제 서비스에 노출하기 전에 반드시 실제 집계로 바꾸거나 카드를 숨길 것.
// 화면에도 "샘플 데이터"를 작게 표시한다(DISTRIBUTION_IS_MOCK). 실제 집계를 붙일 때는 이 파일의 세 표를 API 응답으로 대체하고 플래그를 false로 바꾼다.
// 목표 구조: 선택을 익명으로 서버에 1씩 쌓고(Lambda + DynamoDB 카운터), 표본이 일정 수(예: 50명) 미만이면 카드를 숨긴다.
/** 상황별 비중(%) — 합 100. */
export const SITUATION_SHARE: Record<MomentId, number> = {
  lunch: 34,
  'commute-home': 31,
  walk: 12,
  bed: 23,
};

/** 상황별 "눈이 먼저 가는 곳" 분포(%) — 행마다 합 100. */
const GLANCE_BY_SITUATION: Record<MomentId, Record<GlanceId, number>> = {
  lunch: { text: 38, comic: 16, sound: 8, video: 38 },
  'commute-home': { text: 24, comic: 34, sound: 14, video: 28 },
  walk: { text: 14, comic: 8, sound: 56, video: 22 },
  bed: { text: 22, comic: 30, sound: 12, video: 36 },
};

export type Temperament = 'NT' | 'NF' | 'ST' | 'SF';
export const TEMPERAMENTS: Temperament[] = ['NT', 'NF', 'ST', 'SF'];

/** 눈이 먼저 가는 곳을 고른 사람들의 기질(MBTI 두 글자) 분포(%) — 열마다 합 100. */
export const TEMPERAMENT_BY_GLANCE: Record<GlanceId, Record<Temperament, number>> = {
  text: { NT: 34, NF: 20, ST: 32, SF: 14 },
  comic: { NT: 14, NF: 44, ST: 12, SF: 30 },
  sound: { NT: 18, NF: 26, ST: 20, SF: 36 },
  video: { NT: 40, NF: 16, ST: 30, SF: 14 },
};

/** 전체에서 각 "눈이 먼저 가는 곳"을 고른 사람의 비중(%) — 상황별 비중 × 상황 안의 분포를 합산한 뒤, 합이 정확히 100이 되도록 최대잔여법으로 반올림한다. */
function glanceShares(): Record<GlanceId, number> {
  const ids = Object.keys(GLANCE_BY_SITUATION.lunch) as GlanceId[];
  const raw = ids.map((g) => (Object.keys(SITUATION_SHARE) as MomentId[]).reduce((acc, m) => acc + (SITUATION_SHARE[m] * GLANCE_BY_SITUATION[m][g]) / 100, 0));
  const floors = raw.map(Math.floor);
  let rest = 100 - floors.reduce((a, b) => a + b, 0);
  const order = raw.map((v, i) => ({ i, frac: v - Math.floor(v) })).sort((a, b) => b.frac - a.frac);
  for (const { i } of order) {
    if (rest <= 0) break;
    floors[i] += 1;
    rest -= 1;
  }
  return Object.fromEntries(ids.map((g, i) => [g, floors[i]])) as Record<GlanceId, number>;
}
const GLANCE_SHARES = glanceShares();
export function glanceShare(glance: GlanceId): number {
  return GLANCE_SHARES[glance];
}

/** 상황(어떤 시간에 뉴스를 보는지)별 기질 분포(%) — ⚠️ 샘플. 행마다 합 100. MOMENT_MBTI 예시와 방향을 맞춰 손으로 넣은 값이다. */
export const TEMPERAMENT_BY_SITUATION: Record<MomentId, Record<Temperament, number>> = {
  lunch: { NT: 36, NF: 14, ST: 34, SF: 16 },
  'commute-home': { NT: 18, NF: 38, ST: 14, SF: 30 },
  walk: { NT: 28, NF: 18, ST: 22, SF: 32 },
  bed: { NT: 16, NF: 44, ST: 14, SF: 26 },
};
