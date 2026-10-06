'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

// 링크 미리 받기 보강. Next의 <Link>는 화면에 들어온 링크만 미리 받아, 아직 받지 못한 링크(스크롤 직후, 화면 아래)는 클릭 후 열리기까지 오래 걸린다. 그래서 두 가지를 더한다.
//  1) 의도 감지: 손가락이 닿거나(pointerdown·touchstart) 마우스를 올린(0.08초 머문) 링크를 그 즉시 받는다.
//  2) 한가할 때 앞쪽 기사 링크 몇 개를 순서대로 미리 받는다(첫 화면 밖 링크 포함, 최대 8개, 0.25초 간격).
// 데이터 절약 모드·2G·느린 3G에서는 켜지 않는다. 같은 링크는 한 번만 요청한다(Next 캐시도 중복 제거).
const ARTICLE_PATH = /^\/[a-z]+\/\d{4}\/\d{2}\/\d{2}\//;
const MAX_IDLE = 8;
const IDLE_GAP_MS = 250;
const HOVER_DELAY_MS = 80;

type NetInfo = { saveData?: boolean; effectiveType?: string };

function networkAllowsPrefetch(): boolean {
  const c = (navigator as unknown as { connection?: NetInfo }).connection;
  if (!c) return true;
  if (c.saveData) return false;
  return !(c.effectiveType === 'slow-2g' || c.effectiveType === '2g' || c.effectiveType === '3g');
}

function internalHref(a: HTMLAnchorElement | null): string | null {
  if (!a || !a.href) return null;
  if (a.target && a.target !== '_self') return null;
  if (a.hasAttribute('download') || a.hasAttribute('data-no-prefetch')) return null;
  let url: URL;
  try {
    url = new URL(a.href, window.location.href);
  } catch {
    return null;
  }
  if (url.origin !== window.location.origin) return null;
  if (url.pathname === window.location.pathname && url.search === window.location.search) return null;
  if (url.pathname.startsWith('/api/') || /\.[a-z0-9]{2,5}$/i.test(url.pathname)) return null;
  return url.pathname + url.search;
}

export function LinkPrefetcher() {
  const router = useRouter();
  const pathname = usePathname();

  // 의도 감지 — 앱 전체에 한 번만 건다.
  useEffect(() => {
    if (!networkAllowsPrefetch()) return;
    const seen = new Set<string>();
    let hoverTimer: number | undefined;
    const prefetch = (a: HTMLAnchorElement | null) => {
      const href = internalHref(a);
      if (!href || seen.has(href)) return;
      seen.add(href);
      router.prefetch(href);
    };
    const onDown = (e: Event) => prefetch((e.target as HTMLElement | null)?.closest?.('a') ?? null);
    const onOver = (e: MouseEvent) => {
      const a = (e.target as HTMLElement | null)?.closest?.('a') ?? null;
      window.clearTimeout(hoverTimer);
      if (a) hoverTimer = window.setTimeout(() => prefetch(a), HOVER_DELAY_MS);
    };
    const onOut = () => window.clearTimeout(hoverTimer);
    document.addEventListener('pointerdown', onDown, { passive: true, capture: true });
    document.addEventListener('touchstart', onDown, { passive: true, capture: true });
    document.addEventListener('mouseover', onOver, { passive: true });
    document.addEventListener('mouseout', onOut, { passive: true });
    return () => {
      window.clearTimeout(hoverTimer);
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('touchstart', onDown, true);
      document.removeEventListener('mouseover', onOver);
      document.removeEventListener('mouseout', onOut);
    };
  }, [router]);

  // 한가할 때 앞쪽 기사 링크 미리 받기 — 페이지가 바뀔 때마다 새 화면의 링크로 다시 한다.
  useEffect(() => {
    if (!networkAllowsPrefetch()) return;
    let cancelled = false;
    let timer: number | undefined;
    const start = () => {
      const hrefs: string[] = [];
      for (const a of Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href]'))) {
        const href = internalHref(a);
        if (href && ARTICLE_PATH.test(href.split('?')[0]) && !hrefs.includes(href)) hrefs.push(href);
        if (hrefs.length >= MAX_IDLE) break;
      }
      let i = 0;
      const next = () => {
        if (cancelled || i >= hrefs.length) return;
        router.prefetch(hrefs[i]);
        i += 1;
        timer = window.setTimeout(next, IDLE_GAP_MS);
      };
      next();
    };
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    const kick = () => (ric ? ric(start, { timeout: 4000 }) : window.setTimeout(start, 1500));
    // 페이지 로드가 끝난 뒤에 시작한다 — 첫 화면의 로딩과 경쟁하지 않도록.
    if (document.readyState === 'complete') kick();
    else window.addEventListener('load', kick, { once: true });
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
      window.removeEventListener('load', kick);
    };
  }, [router, pathname]);

  return null;
}
