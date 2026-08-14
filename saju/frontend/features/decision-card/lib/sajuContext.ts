// features/fortune 의 saju_current localStorage 계약을 읽기만 한다 (feature 간 직접 import 금지 규칙 준수 — 자체 매핑 보유)
const HANJA_STEM_OH: Record<string, string> = {
  '甲': '목', '乙': '목', '丙': '화', '丁': '화', '戊': '토',
  '己': '토', '庚': '금', '辛': '금', '壬': '수', '癸': '수',
};

/** localStorage `saju_current.ilgan`(한자 천간)을 오행 문자열로 변환. 없으면 '목' 기본 */
export function readSajuIlganOh(): string {
  try {
    const raw = localStorage.getItem('saju_current');
    if (!raw) return '목';
    const saved = JSON.parse(raw) as { ilgan?: string };
    return (saved.ilgan && HANJA_STEM_OH[saved.ilgan]) || '목';
  } catch {
    return '목';
  }
}
