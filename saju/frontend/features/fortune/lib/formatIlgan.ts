import { HEAVENLY_STEMS } from '@saju/shared/constants/sajuGlossary';

/**
 * "을乙" 같은 일간 레이블을 언어에 맞게 변환.
 *  - ko: 그대로 ("을乙")
 *  - en: 한글을 로마자로 치환 후 한자 유지 ("Eul 乙")
 */
export function formatIlganLabel(ilgan: string, lang: 'ko' | 'en'): string {
  if (!ilgan) return '';
  if (lang !== 'en') return ilgan;
  const ko = ilgan[0];
  const hanja = ilgan.length >= 2 ? ilgan[1] : '';
  const entry = HEAVENLY_STEMS[ko as keyof typeof HEAVENLY_STEMS];
  if (!entry) return ilgan;
  const roman = entry.en.split(' ')[0]; // "Gab (Yang Wood)" → "Gab"
  return hanja ? `${roman} ${hanja}` : roman;
}
