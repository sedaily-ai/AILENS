import type { OnboardingDistribution } from '@/shared/lib/api/onboardingApi';
import { GLANCES, MOMENTS, type GlanceId, type MomentId } from './moments';

// 결과 화면 "다른 분들은 어떻게 볼까요" 분포 — 서버 집계(onboarding_choices, 기기당 최신 1건)의 인원을 비율로 바꾼다.
// 표본이 적어 서버가 counts를 주지 않거나 요청이 실패하면 null을 돌려주고, 화면은 분포 카드를 숨긴다.

export interface Shares {
  /** 상황별 비중(%) — 합 100. */
  situation: Record<MomentId, number>;
  /** 전체에서 각 "눈이 먼저 가는 곳"을 고른 비중(%) — 합 100. */
  glance: Record<GlanceId, number>;
}

/** 인원을 비율로 바꾸고, 합이 정확히 100이 되도록 최대잔여법으로 반올림한다. */
function percents<K extends string>(ids: readonly K[], counts: Record<K, number>): Record<K, number> {
  const total = ids.reduce((a, k) => a + counts[k], 0);
  const raw = ids.map((k) => (total ? (counts[k] * 100) / total : 0));
  const floors = raw.map(Math.floor);
  let rest = total ? 100 - floors.reduce((a, b) => a + b, 0) : 0;
  const order = raw.map((v, i) => ({ i, frac: v - Math.floor(v) })).sort((a, b) => b.frac - a.frac);
  for (const { i } of order) {
    if (rest <= 0) break;
    floors[i] += 1;
    rest -= 1;
  }
  return Object.fromEntries(ids.map((k, i) => [k, floors[i]])) as Record<K, number>;
}

export function toShares(d: OnboardingDistribution | null): Shares | null {
  if (!d?.ready || !d.counts) return null;
  const counts = d.counts;
  const momentIds = MOMENTS.map((m) => m.id);
  const glanceIds = GLANCES.map((g) => g.id);
  const cell = (m: MomentId, g: GlanceId) => counts[m]?.[g] ?? 0;
  const byMoment = Object.fromEntries(momentIds.map((m) => [m, glanceIds.reduce((a, g) => a + cell(m, g), 0)])) as Record<MomentId, number>;
  const byGlance = Object.fromEntries(glanceIds.map((g) => [g, momentIds.reduce((a, m) => a + cell(m, g), 0)])) as Record<GlanceId, number>;
  return { situation: percents(momentIds, byMoment), glance: percents(glanceIds, byGlance) };
}
