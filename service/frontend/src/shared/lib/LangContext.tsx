'use client';

/**
 * Lang stub — ailens.sedaily.ai 는 한국어 전용. AI-saju 본가에서 포팅한
 * ideal-match/couple-match 가 useLang 을 참조하므로 동일 API surface 로 stub.
 */
export type Lang = 'ko' | 'en';

// Korean-only 운영이지만 포팅 컴포넌트가 lang === 'en' 분기 비교를 하므로 union 으로 유지.
// 실제 런타임 값은 항상 'ko'.
export function useLang() {
  return {
    lang: 'ko' as Lang,
    setLang: (_next: Lang) => {},
    t: (ko: string, _en: string) => ko,
    g: (term: string) => term,
    localePath: (path: string) => path,
  };
}
