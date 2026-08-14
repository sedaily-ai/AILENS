/**
 * 매듭 진행 헬퍼 + 명식 컨텍스트 빌더.
 * 매듭 6단계(열기→좁히기→맞히기→얹기→매듭짓기→잇기)의 전이는 ChatTab 에서 다루고,
 * 여기서는 순수 계산/조회만 제공한다.
 */
import {
  buildChongun,
  judgeSinGangYak,
  calculateElementDistribution,
  detectGyeokguk,
  suggestYongsin,
  CG_OH,
  JJ_OH,
  type Pillar,
  type DaeunEntry,
} from '@saju/features/fortune/lib/engine';
import type { ConcernId, SajuContext } from './types';
import { CONCERN_MAP, CONCERNS } from './concerns';

/** pillars + 대운 → 해석용 SajuContext */
export function buildSajuContext(pillars: Pillar[], daeuns: DaeunEntry[], birthYear: number): SajuContext {
  const chongun = buildChongun(pillars);
  const sgy = judgeSinGangYak(pillars);
  const dist = calculateElementDistribution(pillars);

  const gk = detectGyeokguk(pillars);
  const ys = sgy ? suggestYongsin(pillars, sgy, dist) : null;

  const day = pillars[1];
  const ilganOh = chongun?.element || CG_OH[day.c] || '';
  const ilgan = day.ck && day.c ? `${day.ck}(${day.c})` : (day.c || '');
  const ilji = day.jk && day.j ? `${day.jk}(${day.j})` : (day.j || '');
  const age = new Date().getFullYear() - birthYear + 1; // 한국식 나이 근사

  const current = daeuns.length
    ? ([...daeuns].reverse().find(d => d.age <= age) ?? daeuns[0])
    : null;
  const next = current ? daeuns.find(d => d.age > current.age) ?? null : null;

  return {
    ilgan,
    ilganOh,
    ilji,
    level: sgy?.level ?? '중화',
    score: sgy?.score ?? 50,
    counts: dist.counts,
    lacking: dist.lacking,
    excess: dist.excess,
    gyeokguk: gk?.name ?? '',
    yongsin: ys?.primary ?? '',
    yongsinRole: ys?.role ?? '',
    yongsinDesc: ys?.description ?? '',
    keywords: chongun?.keywords ?? [],
    currentDaeunOh: current ? JJ_OH[current.j] || '' : '',
    currentDaeunAge: current?.age ?? 0,
    nextDaeunOh: next ? JJ_OH[next.j] || '' : '',
    nextDaeunAge: next?.age ?? 0,
  };
}

/** concern 의 좁히기 질문 수 (= 깊이) */
export function narrowCount(concern: ConcernId): number {
  return CONCERN_MAP[concern].narrow.length;
}

/** 아직 안 꺼낸 고민들 */
export function remainingConcerns(raised: ConcernId[]): ConcernId[] {
  return CONCERNS.map(c => c.id).filter(id => !raised.includes(id));
}
