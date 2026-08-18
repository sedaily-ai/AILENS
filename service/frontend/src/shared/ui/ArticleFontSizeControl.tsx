'use client';

import { useEffect, useState } from 'react';

// 글자 크기 조절 — lens/[slug]/LensViewClient.tsx와 letters/[id]/
// LetterDetailClient.tsx가 CSS 변수 이름만 다르게(--lens-font-scale vs
// --letter-font-scale) 거의 동일한 컴포넌트를 각자 로컬 복제하고 있던 걸
// 하나로 합쳤다(2026-08-18). 어느 CSS 변수·localStorage 키를 쓸지는 계속
// 페이지마다 다르게 둔다(본문 fontSize를 calc(Npx * var(...))로 배선하는
// 지점이 페이지마다 다른 곳에 있어 변수 이름을 강제로 통일하면 그쪽도
// 같이 손봐야 함 — 지금은 컴포넌트 중복만 없애는 게 목적이라 props로 남김).
export type ArticleFontSize = 'small' | 'medium' | 'large';
const FONT_SCALE: Record<ArticleFontSize, string> = { small: '0.9', medium: '1', large: '1.15' };

export function ArticleFontSizeControl({ cssVar, storageKey }: { cssVar: string; storageKey: string }) {
  const [size, setSize] = useState<ArticleFontSize>('medium');

  useEffect(() => {
    try {
      const saved = localStorage.getItem(storageKey) as ArticleFontSize | null;
      if (saved && saved in FONT_SCALE) {
        setSize(saved);
        document.documentElement.style.setProperty(cssVar, FONT_SCALE[saved]);
      }
    } catch {
      // 시크릿 모드 등 localStorage 접근 불가 — 기본값(medium)으로 둔다.
    }
    return () => {
      document.documentElement.style.removeProperty(cssVar);
    };
  }, [cssVar, storageKey]);

  const change = (next: ArticleFontSize) => {
    setSize(next);
    document.documentElement.style.setProperty(cssVar, FONT_SCALE[next]);
    try {
      localStorage.setItem(storageKey, next);
    } catch {
      // 무시 — 저장 안 돼도 이번 방문 중엔 정상 동작.
    }
  };

  const opt = (key: ArticleFontSize, label: string, px: number) => (
    <button
      type="button"
      onClick={() => change(key)}
      className={`px-2 py-1 font-medium transition-colors ${size === key ? 'text-gray-900' : 'text-gray-400 hover:text-gray-900'}`}
      style={{ fontSize: px }}
      aria-label={`${label} 글자 크기`}
      title={label}
    >
      A
    </button>
  );

  return (
    <div className="flex items-center" style={{ gap: 2, padding: 2 }}>
      {opt('small', '작게', 12)}
      {opt('medium', '보통', 14)}
      {opt('large', '크게', 16)}
    </div>
  );
}
