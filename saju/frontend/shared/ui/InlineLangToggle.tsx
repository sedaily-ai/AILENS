'use client';

/**
 * InlineLangToggle — 점신 결 KO/EN 토글 (phase-04)
 *
 * shared/lib/LangToggle (회색 알약 + dark utility) 의 점신 톤 대체.
 * 한지 트랙 + 잉크 핸들 + 활성 라벨 흰색.
 */

import { useLang } from '@saju/shared/lib/LangContext';
import { SAJU } from './sajuTokens';

export function InlineLangToggle() {
  const { lang, setLang } = useLang();
  const isEn = lang === 'en';

  return (
    <button
      type="button"
      onClick={() => setLang(isEn ? 'ko' : 'en')}
      aria-label={isEn ? '한국어로 전환' : 'Switch to English'}
      title={isEn ? '한국어' : 'English'}
      className="relative inline-flex items-center rounded-full transition-colors hover:brightness-95"
      style={{
        width: 60,
        height: 30,
        padding: 3,
        background: '#F0E9DC',
        border: '1px solid #E5DCC8',
      }}
    >
      <span
        aria-hidden
        className="absolute rounded-full transition-transform duration-300 ease-out"
        style={{
          width: 26,
          height: 22,
          top: 3,
          left: 3,
          background: SAJU.warmDeep,
          transform: isEn ? 'translateX(28px)' : 'translateX(0)',
          boxShadow: '0 1px 2px rgba(217,101,30,0.25)',
        }}
      />
      <span
        className="relative z-10 flex items-center justify-center text-[10px] font-extrabold tracking-tight transition-colors"
        style={{ width: 26, height: 22, color: isEn ? SAJU.inkSoft : '#FFFFFF' }}
      >
        KO
      </span>
      <span
        className="relative z-10 flex items-center justify-center text-[10px] font-extrabold tracking-tight transition-colors"
        style={{ width: 26, height: 22, color: isEn ? '#FFFFFF' : SAJU.inkSoft }}
      >
        EN
      </span>
    </button>
  );
}
