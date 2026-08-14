'use client';

import { createContext, useCallback, useContext, useEffect, useMemo } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  EARTHLY_BRANCHES,
  EVALUATION_TONES,
  FEATURE_NAMES,
  FIVE_ELEMENTS,
  HEAVENLY_STEMS,
  INPUT_LABELS,
  INTERACTIONS,
  PILLAR_LABELS,
  SINSAL,
  TEN_GODS,
  TEN_GODS_AXIS,
  TIME_PERIODS,
  TWELVE_STAGES,
  type GlossaryEntry,
} from '@saju/shared/constants/sajuGlossary';

export type Lang = 'ko' | 'en';

interface LangContextValue {
  lang: Lang;
  setLang: (next: Lang) => void;
  t: (ko: string, en: string) => string;
  g: (term: string) => string;
  /** Localize a path: '/blog' → '/en/blog' when lang === 'en' (basePath는 next/link·router가 자동으로 붙임) */
  localePath: (path: string) => string;
}

// 2026-08-15, 완전 독립 앱으로 분리하며 next.config.ts의 basePath: "/saju"를
// 되살렸다 — usePathname()/router.push()/next/link가 이제 /saju 프리픽스를
// 자동으로 붙이고 떼주므로(Next.js 공식 동작), 여기서 수동으로 /saju를
// 붙이거나 떼는 로직(예전 MOUNT_PREFIX/stripMount)은 제거했다. 수동으로
// 남겨야 하는 건 next/image src나 fetch() URL처럼 Next가 basePath를
// 자동 처리하지 않는 곳뿐(그런 곳은 shared/lib/basePath.ts의 withBasePath 사용).

function deriveLang(pathname: string | null): Lang {
  if (!pathname) return 'ko';
  if (pathname === '/en' || pathname.startsWith('/en/')) return 'en';
  return 'ko';
}

function stripLocale(pathname: string): string {
  if (pathname === '/en') return '/';
  if (pathname.startsWith('/en/')) return pathname.slice(3) || '/';
  return pathname;
}

function withLocale(pathname: string, lang: Lang): string {
  const bare = stripLocale(pathname);
  if (lang === 'ko') return bare;
  if (bare === '/') return '/en';
  return `/en${bare}`;
}

const LangContext = createContext<LangContextValue | null>(null);

const GLOSSARY: Record<string, GlossaryEntry> = {
  ...FIVE_ELEMENTS,
  ...HEAVENLY_STEMS,
  ...EARTHLY_BRANCHES,
  ...TEN_GODS,
  ...TEN_GODS_AXIS,
  ...TIME_PERIODS,
  ...PILLAR_LABELS,
  ...INTERACTIONS,
  ...EVALUATION_TONES,
  ...TWELVE_STAGES,
  ...SINSAL,
  ...FEATURE_NAMES,
  ...INPUT_LABELS,
};

export function LangProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const lang = useMemo<Lang>(() => deriveLang(pathname), [pathname]);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = lang;
    }
  }, [lang]);

  const setLang = useCallback((next: Lang) => {
    if (next === lang) return;
    const target = withLocale(pathname || '/', next);
    router.push(target);
  }, [lang, pathname, router]);

  const t = useCallback((ko: string, en: string) => (lang === 'en' ? en : ko), [lang]);

  const g = useCallback((term: string) => {
    if (lang !== 'en') return term;
    const entry = GLOSSARY[term];
    return entry?.en ?? term;
  }, [lang]);

  const localePath = useCallback((path: string) => withLocale(path, lang), [lang]);

  return (
    <LangContext.Provider value={{ lang, setLang, t, g, localePath }}>
      {children}
    </LangContext.Provider>
  );
}

export function useLang(): LangContextValue {
  const ctx = useContext(LangContext);
  if (!ctx) {
    return {
      lang: 'ko',
      setLang: () => {},
      t: (ko) => ko,
      g: (term) => term,
      localePath: (path) => path,
    };
  }
  return ctx;
}
