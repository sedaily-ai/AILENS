'use client';

import { useState } from 'react';
import { useLang } from '@saju/shared/lib/LangContext';
import type { ReasonCode } from '../types';

interface Props {
  code: ReasonCode;
  label: string;
  labelEn?: string;
  points: number;
}

/** 근거 코드별 한/영 설명 사전 — 툴팁 + 항상 펼쳐진 상세 해설에서 재사용 */
export const REASON_EXPLAIN: Record<ReasonCode, { ko: string; en: string; tagKo: string; tagEn: string }> = {
  lacking: {
    tagKo: '#부족한기운채움',
    tagEn: '#ElementFill',
    ko: '내 사주에서 비어 있는 기운을 상대가 가지고 있는 타입이에요. 옆에 있을수록 "이 사람 옆이 제일 편하다"는 감각이 커지는, 장기적으로 안정감이 강한 조합입니다.',
    en: 'Someone whose chart carries the element yours is missing. Over time this builds a growing sense of "I feel most at ease next to this person" — the classic long-stable pairing.',
  },
  excess: {
    tagKo: '#균형잡기',
    tagEn: '#BalanceOut',
    ko: '나한테 너무 몰려 있는 기운을 상대가 눌러주는 관계예요. 혼자 있을 땐 한쪽으로 쏠리기 쉬운 성향을, 곁에서 자연스럽게 균형 잡아주는 타입입니다.',
    en: 'Someone who tones down the element overloaded in your chart. When you tend to tilt too far on your own, this partner naturally brings you back to center.',
  },
  stemHap: {
    tagKo: '#자연스러운끌림',
    tagEn: '#NaturalAttraction',
    ko: '사주에서 가장 강한 "끌림"으로 꼽는 조합이에요. 태어난 날의 기운(일간)이 정해진 다섯 쌍(갑·기, 을·경, 병·신, 정·임, 무·계) 중 하나로 딱 맞아떨어지는 관계로, 처음부터 편안하면서 설렘도 함께 느껴지는 타입입니다.',
    en: 'The strongest "natural attraction" pattern in saju — your day stems form one of the five classical pairs (Gap-Gi, Eul-Gyeong, Byeong-Sin, Jeong-Im, Mu-Gye). Usually read as a partner who feels both comfortable and exciting from the very first meeting.',
  },
  spouseGwan: {
    tagKo: '#배우자자리',
    tagEn: '#SpousePosition',
    ko: '전통 사주에서 여성의 "배우자 자리"로 보는 기운과 맞아떨어지는 타입이에요. 흔들릴 때 기준을 잡아주고 방향을 제시해 주는, 든든하게 중심이 되어 주는 상대로 읽습니다.',
    en: 'Matches the element classical saju places in the "spouse seat" for women. Reads as a partner who grounds you, provides structure and direction — someone you can lean on when things wobble.',
  },
  spouseJae: {
    tagKo: '#배우자자리',
    tagEn: '#SpousePosition',
    ko: '전통 사주에서 남성의 "배우자 자리"로 보는 기운과 맞아떨어지는 타입이에요. 현실 감각이 또렷하고, 관계에 실속을 더해 주는 상대로 읽습니다.',
    en: 'Matches the element classical saju places in the "spouse seat" for men. Reads as a partner who brings sharp practical sense and grounds the relationship in everyday footing.',
  },
  samhap: {
    tagKo: '#띠삼합',
    tagEn: '#TripleHarmony',
    ko: '띠로 치면 "세 동물이 한 팀"을 이루는 조합이에요 (예: 호랑이·말·개 / 돼지·토끼·양 / 원숭이·쥐·용 / 뱀·닭·소). 둘만 있을 때는 물론, 주변 사람들까지 자연스럽게 어우러지는 넓은 조화로 해석됩니다.',
    en: 'A triple-animal harmony by zodiac (e.g., Tiger-Horse-Dog, Pig-Rabbit-Goat, Monkey-Rat-Dragon, Snake-Rooster-Ox). Reads as a bond that flows easily — not just one-on-one but in groups too.',
  },
  yukhap: {
    tagKo: '#띠짝꿍',
    tagEn: '#SixHarmony',
    ko: '띠끼리 둘이 짝을 이루는 조합이에요 (예: 쥐·소, 호랑이·돼지, 토끼·개). 일상 리듬과 생활 루틴이 서로 잘 녹아드는 부드러운 조화라, 특히 같이 사는 관계에 유리합니다.',
    en: 'A six-harmony zodiac pair (e.g., Rat-Ox, Tiger-Pig, Rabbit-Dog). Reads as a soft, everyday-rhythm match — especially good for couples sharing daily life.',
  },
};

export function ReasonChip({ code, label, labelEn, points }: Props) {
  const { lang, t } = useLang();
  const [open, setOpen] = useState(false);
  const info = REASON_EXPLAIN[code];
  const displayTag = lang === 'en' ? info.tagEn : info.tagKo;
  const displayLabel = lang === 'en' && labelEn ? labelEn : label;
  const explanation = lang === 'en' ? info.en : info.ko;

  return (
    <span className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/80 dark:bg-gray-900/60 border border-gray-200 dark:border-gray-700 text-[10.5px] font-medium text-gray-700 dark:text-gray-200 cursor-pointer hover:border-pink-300 dark:hover:border-pink-700 transition-colors"
        aria-expanded={open}
        aria-label={t('근거 설명', 'Show reasoning')}
      >
        <span className="text-pink-600 dark:text-pink-400 font-bold">{displayTag}</span>
        <span className="text-gray-300 dark:text-gray-600">·</span>
        <span>{displayLabel}</span>
        <span className="text-pink-600 dark:text-pink-400 font-bold">+{points}</span>
      </button>
      {open && (
        <span
          role="tooltip"
          className="absolute top-full left-0 mt-1.5 z-20 w-[240px] p-2.5 rounded-lg bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-[11px] leading-[1.55] shadow-lg"
        >
          {explanation}
        </span>
      )}
    </span>
  );
}
