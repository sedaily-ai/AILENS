'use client';

import { useState } from 'react';
import { useLang } from '@saju/shared/lib/LangContext';
import { SAJU, SERIF } from '@saju/shared/ui/sajuTokens';
import { TrigramSymbol } from './TrigramSymbol';
import { drawRandomTrigram, type Trigram } from '../lib/trigrams';

export function IchingDraw() {
  const { t } = useLang();
  const [result, setResult] = useState<Trigram | null>(null);

  const draw = () => setResult(drawRandomTrigram());

  return (
    <div>
      {!result ? (
        <div
          className="rounded-[24px] bg-white px-6 py-12 flex flex-col items-center text-center"
          style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
        >
          <p className="text-[13.5px] leading-relaxed mb-6 max-w-[260px]" style={{ color: SAJU.inkSoft }}>
            {t(
              '마음속으로 지금 고민 하나를 떠올린 뒤, 괘를 뽑아보세요.',
              'Hold a question in your mind, then draw a trigram.',
            )}
          </p>
          <button
            type="button"
            onClick={draw}
            className="rounded-full px-6 py-3 text-[14px] font-bold text-white transition-all hover:-translate-y-0.5 active:scale-95"
            style={{ background: SAJU.warmDeep }}
          >
            {t('괘 뽑기', 'Draw a trigram')}
          </button>
        </div>
      ) : (
        <div
          className="rounded-[24px] bg-white px-6 py-9 flex flex-col items-center text-center"
          style={{ boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}
        >
          <div className="mb-5" style={{ color: SAJU.warmDeep }}>
            <TrigramSymbol lines={result.lines} color={SAJU.warmDeep} width={84} />
          </div>

          <h3 className="text-[26px] font-black" style={{ color: SAJU.ink, fontFamily: SERIF }}>
            {result.hanja}
            <span className="text-[15px] font-bold ml-1.5" style={{ color: SAJU.inkSub }}>
              {result.ko}
            </span>
          </h3>
          <p className="text-[12.5px] font-semibold mt-1" style={{ color: SAJU.warmDeep }}>
            {result.nature} · {result.keyword}
          </p>

          <div className="w-10 h-px my-4" style={{ background: SAJU.line }} />

          <p className="text-[14px] leading-relaxed max-w-[280px]" style={{ color: SAJU.inkSoft }}>
            {result.meaning}
          </p>

          <button
            type="button"
            onClick={draw}
            className="mt-6 text-[12.5px] font-semibold"
            style={{ color: SAJU.inkSub }}
          >
            {t('다시 뽑기', 'Draw again')}
          </button>
        </div>
      )}
    </div>
  );
}
