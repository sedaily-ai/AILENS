'use client';

import { useLang } from './LangContext';

export function LangToggle({ className = '' }: { className?: string }) {
  const { lang, setLang } = useLang();
  const isEn = lang === 'en';

  return (
    <button
      type="button"
      onClick={() => setLang(isEn ? 'ko' : 'en')}
      aria-label={isEn ? '한국어로 전환' : 'Switch to English'}
      title={isEn ? '한국어' : 'English'}
      className={`relative inline-flex items-center rounded-full p-0.5 bg-gray-200 dark:bg-gray-800 transition-colors ${className}`}
      style={{ width: 54, height: 28 }}
    >
      <span
        aria-hidden="true"
        className="absolute top-0.5 w-6 h-6 rounded-full shadow-sm transition-transform duration-200"
        style={{
          background: '#FFFFFF',
          transform: isEn ? 'translateX(26px)' : 'translateX(0)',
        }}
      />
      <span
        className="relative z-10 w-6 h-6 flex items-center justify-center text-[10px] font-bold"
        style={{ color: isEn ? '#9CA3AF' : '#111827' }}
      >
        KO
      </span>
      <span
        className="relative z-10 w-6 h-6 flex items-center justify-center text-[10px] font-bold"
        style={{ color: isEn ? '#111827' : '#9CA3AF' }}
      >
        EN
      </span>
    </button>
  );
}
