'use client';

import { useEffect, useState } from 'react';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'theme';

function applyTheme(_theme: Theme) {
  // phase-03 (2026-05-24): 점신 톤 라이트 단일. dark 클래스 절대 추가 안 함.
  // UI 토글은 살아있으나 시각 효과 없음. ThemeToggle 자체 제거는 phase-04 예정.
  document.documentElement.classList.remove('dark');
}

function getSavedTheme(): Theme | null {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    return v === 'dark' || v === 'light' ? v : null;
  } catch {
    return null;
  }
}

function getSystemTheme(): Theme {
  if (typeof window === 'undefined') return 'light';
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export function ThemeToggle({ className = '' }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>('light');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const initial = getSavedTheme() ?? getSystemTheme();
    setTheme(initial);
    applyTheme(initial);
    setMounted(true);
  }, []);

  const setTo = (next: Theme) => {
    if (next === theme) return;
    setTheme(next);
    applyTheme(next);
    try { localStorage.setItem(STORAGE_KEY, next); } catch {}
  };

  const isDark = theme === 'dark';

  return (
    <button
      type="button"
      onClick={() => setTo(isDark ? 'light' : 'dark')}
      aria-label={isDark ? '라이트 모드로 전환' : '다크 모드로 전환'}
      title={isDark ? '라이트 모드' : '다크 모드'}
      className={`relative inline-flex items-center rounded-full p-0.5 bg-gray-200 dark:bg-gray-800 transition-colors ${className}`}
      style={{ width: 54, height: 28 }}
    >
      {/* 슬라이더 (활성 쪽 강조) */}
      <span
        aria-hidden="true"
        className="absolute top-0.5 w-6 h-6 rounded-full shadow-sm transition-transform duration-200"
        style={{
          background: isDark ? '#1F2937' : '#FFFFFF',
          transform: mounted && isDark ? 'translateX(26px)' : 'translateX(0)',
        }}
      />

      {/* 태양 */}
      <span className="relative z-10 w-6 h-6 flex items-center justify-center">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={isDark ? '#9CA3AF' : '#F59E0B'} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
        </svg>
      </span>

      {/* 달 */}
      <span className="relative z-10 w-6 h-6 flex items-center justify-center">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke={isDark ? '#E5E7EB' : '#9CA3AF'} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z" />
        </svg>
      </span>
    </button>
  );
}
