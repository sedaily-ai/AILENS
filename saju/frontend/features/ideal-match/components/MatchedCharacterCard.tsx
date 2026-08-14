'use client';

import Link from 'next/link';
import { useLang } from '@saju/shared/lib/LangContext';
import { ZodiacIcon } from '@saju/shared/ui/ZodiacIcon';
import { findGapjaByOhAndZodiac, OH_TONE, type Oh } from '@saju/shared/lib/gapja';

interface Props {
  primaryOh: string;
  zodiacKo: string;
}

/** 이상형 역산 결과(오행+추천 띠)를 60갑자 캐릭터 하나로 매칭해 보여주는 카드 */
export function MatchedCharacterCard({ primaryOh, zodiacKo }: Props) {
  const { t, localePath } = useLang();
  const character = findGapjaByOhAndZodiac(primaryOh as Oh, zodiacKo);
  if (!character) return null;
  const tone = OH_TONE[character.stem.oh];

  return (
    <Link
      href={localePath('/character')}
      className="flex items-center gap-3 rounded-[16px] bg-white p-4 mb-3 transition-all hover:-translate-y-0.5 active:scale-[0.99]"
      style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
    >
      <div
        className="w-12 h-12 rounded-full flex items-center justify-center shrink-0"
        style={{ background: `linear-gradient(135deg, ${tone.bg} 0%, #FFFFFF 100%)`, color: tone.fg }}
      >
        <ZodiacIcon branch={character.branch.hanja} size={26} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[10.5px] font-bold tracking-wide text-gray-400 mb-0.5">
          {t('나와 맞는 캐릭터', 'Your matching character')}
        </p>
        <p className="text-[15px] font-black text-gray-900 leading-tight">
          {character.stem.ko}{character.branch.ko}
          <span className="text-[12px] font-semibold text-gray-500 ml-1.5">
            ({character.stem.hanja}{character.branch.hanja})
          </span>
        </p>
        <p className="text-[12px] text-gray-500 mt-0.5 truncate">
          {character.stem.keyword} · {character.branch.zodiacKo}
        </p>
      </div>
      <span className="text-[18px] shrink-0 text-gray-300" aria-hidden>›</span>
    </Link>
  );
}
