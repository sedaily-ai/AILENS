'use client';

import { useLang } from '@saju/shared/lib/LangContext';
import { SAJU } from '@saju/shared/ui/sajuTokens';
import type { EraFact } from '../lib/eraFacts';

/**
 * 시대 팩트 카드 — "사주 위에 얹는 세상의 흐름".
 * 실데이터(서울경제 기사, url 있음)면 링크 + '서울경제' 배지, placeholder 면 '예시' 배지.
 */
export function EraFactCard({ facts }: { facts: EraFact[] }) {
  const { t, lang } = useLang();
  if (!facts.length) return null;

  const isReal = facts.some(f => f.url);

  return (
    <div className="chat-in-bot mb-2 max-w-[88%] rounded-2xl overflow-hidden" style={{ border: `1px solid ${SAJU.line}`, background: '#fff' }}>
      <div className="flex items-center justify-between px-3.5 py-2.5" style={{ background: SAJU.warmSoft }}>
        <span className="text-[13px] font-bold" style={{ color: SAJU.ink }}>
          📊 {t('지금 시대의 흐름', "Today's currents")}
        </span>
        <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full" style={{ background: '#fff', color: SAJU.warmDeep, border: `1px solid ${SAJU.line}` }}>
          {isReal ? t('서울경제', 'Sedaily') : t('예시', 'Sample')}
        </span>
      </div>
      <ul className="px-3.5 py-3 space-y-2.5">
        {facts.map((f, i) => {
          const text = lang === 'en' ? f.en : f.ko;
          const source = lang === 'en' ? f.sourceEn : f.source;
          return (
            <li key={i} className="flex gap-2">
              <span aria-hidden style={{ color: SAJU.warmDeep }}>·</span>
              <div className="min-w-0">
                {f.url ? (
                  <a
                    href={f.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block text-[13.5px] leading-snug underline decoration-transparent hover:decoration-inherit transition"
                    style={{ color: SAJU.ink }}
                  >
                    {text}
                  </a>
                ) : (
                  <p className="text-[13.5px] leading-snug" style={{ color: SAJU.ink }}>{text}</p>
                )}
                <p className="text-[10.5px] mt-0.5" style={{ color: SAJU.inkSub }}>{source}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
