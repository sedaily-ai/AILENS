/**
 * 오행별 카드 비주얼 톤 — 단색 파스텔 배경 + 손그림 라인 아이콘 + 오행 한자.
 * shared/lib/gapja.ts 의 Oh 타입과 값은 같지만 feature 간 직접 import 금지 규칙에 따라 독립 보유.
 */

export type Oh = '목' | '화' | '토' | '금' | '수';

export interface OhVisual {
  hanja: string;
  bg: string;
  line: string;
}

export const OH_VISUAL: Record<Oh, OhVisual> = {
  목: { hanja: '木', bg: '#E8F0E2', line: '#4A7A52' },
  화: { hanja: '火', bg: '#FADCD8', line: '#C1503E' },
  토: { hanja: '土', bg: '#F5EED2', line: '#A8823B' },
  금: { hanja: '金', bg: '#E9E9E4', line: '#5B5B54' },
  수: { hanja: '水', bg: '#DCE6EC', line: '#3E6B87' },
};

/** 일간(天干) → 오행 */
export const CG_OH: Record<string, Oh> = {
  '甲': '목', '乙': '목', '丙': '화', '丁': '화', '戊': '토',
  '己': '토', '庚': '금', '辛': '금', '壬': '수', '癸': '수',
};

export function readMyOh(): Oh | null {
  try {
    const raw = localStorage.getItem('saju_current');
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { ilgan?: string };
    if (!parsed.ilgan) return null;
    return CG_OH[parsed.ilgan] ?? null;
  } catch {
    return null;
  }
}
