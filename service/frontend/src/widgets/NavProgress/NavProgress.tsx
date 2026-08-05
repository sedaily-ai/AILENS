'use client';

import { useEffect, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

/**
 * 상단 가는 진행 막대 — 클릭 직후 즉시 노출되어 "지금 가고 있어요" 시각 신호를 줌.
 * - Header Link 클릭 시 capture-phase 로 click 이벤트를 가로채 setStarted(true)
 * - pathname / search 가 바뀌면 자동 fadeOut + reset
 * - 정적 export 모드에서 라우터 이벤트 API 가 없는 점을 보완
 */
export function NavProgress() {
  const [active, setActive] = useState(false);
  const [progress, setProgress] = useState(0);
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const routeKey = `${pathname}?${searchParams.toString()}`;

  useEffect(() => {
    // 라우트 변경 감지 — 막대 완료 후 숨김.
    if (!active) return;
    setProgress(100);
    const t1 = window.setTimeout(() => setActive(false), 220);
    const t2 = window.setTimeout(() => setProgress(0), 460);
    return () => { window.clearTimeout(t1); window.clearTimeout(t2); };
    // routeKey 가 바뀔 때만 — active 의존성은 의도적으로 제외.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeKey]);

  useEffect(() => {
    // capture phase 로 a[href] 클릭 가로채기 — same-origin 내부 라우팅만.
    const onClick = (e: MouseEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t) return;
      const a = t.closest('a') as HTMLAnchorElement | null;
      if (!a || !a.href) return;
      // 새 탭/조합키는 제외
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      if (a.target && a.target !== '_self') return;
      try {
        const url = new URL(a.href, window.location.href);
        if (url.origin !== window.location.origin) return;
        // 같은 경로면 무시
        const sameHref = url.pathname === window.location.pathname && url.search === window.location.search;
        if (sameHref) return;
      } catch { return; }
      setActive(true);
      setProgress(15);
      // 트릭: 살짝씩 진행하다가 routeKey 변경 시 100% 까지
      window.setTimeout(() => setProgress((p) => (p < 70 ? 70 : p)), 220);
      window.setTimeout(() => setProgress((p) => (p < 85 ? 85 : p)), 600);
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, []);

  if (!active && progress === 0) return null;

  return (
    <div
      aria-hidden
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        height: 2.5,
        zIndex: 9999,
        pointerEvents: 'none',
      }}
    >
      <div
        style={{
          height: '100%',
          width: `${progress}%`,
          background: 'linear-gradient(90deg, #3182F6 0%, #6FB0FF 100%)',
          boxShadow: '0 0 8px rgba(49,130,246,0.55)',
          transition: 'width 220ms cubic-bezier(.22,1,.36,1), opacity 220ms ease',
          opacity: active ? 1 : 0,
          borderRadius: 2,
        }}
      />
    </div>
  );
}
