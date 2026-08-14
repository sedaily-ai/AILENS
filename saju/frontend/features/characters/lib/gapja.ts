/**
 * 60갑자 데이터 재노출 — 실제 데이터는 shared/lib/gapja.ts (ideal-match 도 공유).
 * 이 파일은 characters feature 전용 헬퍼(readMyDayGapjaId)만 추가로 갖는다.
 */
export {
  STEMS, BRANCHES, OH_TONE, buildGapjaList, findGapjaByOhAndZodiac,
  type Oh, type StemInfo, type BranchInfo, type GapjaCharacter,
} from '@saju/shared/lib/gapja';

/** 사용자의 일주(日柱) — localStorage saju_current 의 pillars[1] (년월일시 중 '일') */
export function readMyDayGapjaId(): string | null {
  try {
    const raw = localStorage.getItem('saju_current');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { pillars?: { c?: string; j?: string }[] };
    const day = parsed.pillars?.[1];
    if (!day?.c || !day?.j) return null;
    return `${day.c}${day.j}`;
  } catch {
    return null;
  }
}
