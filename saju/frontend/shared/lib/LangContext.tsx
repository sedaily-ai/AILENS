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
  /** Localize a path: '/saju' → '/saju/en/saju' when lang === 'en' (AILENS-mounted, /saju prefix always added) */
  localePath: (path: string) => string;
}

// AILENS 내 마운트 경로 — 이 vendored 앱은 항상 /saju 아래에서만 렌더된다
// (독립 배포 saju.sedaily.ai 였을 때의 basePath 역할을 여기서 대신함).
const MOUNT_PREFIX = '/saju';

/** usePathname()이 돌려주는 실제 브라우저 경로에서 /saju 마운트 프리픽스를 제거 */
function stripMount(pathname: string): string {
  if (pathname === MOUNT_PREFIX) return '/';
  if (pathname.startsWith(`${MOUNT_PREFIX}/`)) return pathname.slice(MOUNT_PREFIX.length) || '/';
  return pathname;
}

function deriveLang(pathname: string | null): Lang {
  if (!pathname) return 'ko';
  const bare = stripMount(pathname);
  if (bare === '/en' || bare.startsWith('/en/')) return 'en';
  return 'ko';
}

function stripLocale(pathname: string): string {
  if (pathname === '/en') return '/';
  if (pathname.startsWith('/en/')) return pathname.slice(3) || '/';
  return pathname;
}

function withLocale(pathname: string, lang: Lang): string {
  const bare = stripLocale(pathname);
  if (lang === 'ko') return `${MOUNT_PREFIX}${bare === '/' ? '' : bare}` || MOUNT_PREFIX;
  if (bare === '/') return `${MOUNT_PREFIX}/en`;
  return `${MOUNT_PREFIX}/en${bare}`;
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
    const target = withLocale(stripMount(pathname || '/'), next);
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
