'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { displayHeadline } from '@/shared/lib/content/displayHeadline';
import { lensPath } from '@/shared/lib/content/lensUrl';
import { trackEvent } from '@/shared/lib/tracking/trackEvent';

// 이전/다음 기사 이동 — 시간순(같은 카테고리). "이전"=더 오래된 글, "다음"=더 최근 글.
// 눈에 보이는 이동 수단(하단 버튼, 양옆 화살표)이 기본이고, 키보드 ←/→와 폰 좌우 스와이프는 보완이다.
//   · 폰: 좌우로 밀면 활성 패널이 손가락을 따라 조금 움직이고, 가장자리에 이동할 기사 제목이 점점 진해진다. 기준을 넘기면 이동.
//   · 읽다가 손이 스치는 오작동을 막으려 기준을 넉넉히(폭의 1/4, 최소 90px) 잡고, 가로가 확실히 우세할 때만 반응한다.
//   · 오디오·영상·대본 스크롤·슬라이더·자체 스와이프(카드뉴스) 위, 화면 가장자리(iOS 뒤로가기 제스처 영역)에서 시작한 터치는 무시.
// 트랙패드 두 손가락 밀기는 맥 뒤로가기와 겹쳐 지원하지 않는다.

export interface ArticleNeighbor {
  id: string;
  date: string;
  category: string | null;
  headline: string;
}

type Neighbors = { prev: ArticleNeighbor | null; next: ArticleNeighbor | null };

const IGNORE_TOUCH = 'audio, video, iframe, input, textarea, select, [data-own-swipe], .aap-script, .aap-wavewrap, [role=slider], [role=tablist]';
const IGNORE_KEY = 'input, textarea, select, [contenteditable=true], [role=tab], [role=slider], audio, video';
const EDGE_GUARD = 24;
const MAX_FOLLOW = 56;

export function ArticleNeighborNav({ articleId, prev, next }: Neighbors & { articleId: string }) {
  const router = useRouter();
  const [drag, setDrag] = useState<{ dx: number; ok: boolean } | null>(null);
  const prevRef = useRef(prev);
  const nextRef = useRef(next);
  useEffect(() => {
    prevRef.current = prev;
    nextRef.current = next;
  }, [prev, next]);

  const go = useCallback(
    (to: ArticleNeighbor, method: 'key' | 'swipe' | 'edge', direction: 'prev' | 'next') => {
      trackEvent('article_neighbor_click', { article_id: articleId, to_article_id: to.id, direction, method, ...(to.category ? { category: to.category } : {}) });
      router.push(lensPath(to));
    },
    [articleId, router],
  );

  // 이전/다음 기사를 한가할 때 미리 받아 둔다 — 스와이프·화살표 키·화살표 버튼이 지연 없이 바로 넘어가게.
  useEffect(() => {
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number }).requestIdleCallback;
    const run = () => {
      if (prevRef.current) router.prefetch(lensPath(prevRef.current));
      if (nextRef.current) router.prefetch(lensPath(nextRef.current));
    };
    const id = ric ? ric(run, { timeout: 3000 }) : window.setTimeout(run, 1500);
    return () => {
      if (!ric) window.clearTimeout(id);
    };
  }, [router, prev?.id, next?.id]);

  // 키보드 ←/→
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      if ((e.target as HTMLElement | null)?.closest?.(IGNORE_KEY)) return;
      const to = e.key === 'ArrowLeft' ? prevRef.current : nextRef.current;
      if (!to) return;
      go(to, 'key', e.key === 'ArrowLeft' ? 'prev' : 'next');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [go]);

  // 폰 스와이프
  useEffect(() => {
    let start: { x: number; y: number } | null = null;
    let axis: 'x' | 'y' | null = null;
    let raf = 0;
    let crossed = false;
    const blocks = () => Array.from(document.querySelectorAll<HTMLElement>('#main-content .lw'));
    const reduce = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const threshold = () => Math.max(90, window.innerWidth * 0.25);

    const reset = () => {
      cancelAnimationFrame(raf);
      blocks().forEach((el) => {
        el.style.transition = reduce() ? 'none' : 'transform .25s cubic-bezier(.2,0,0,1)';
        el.style.transform = '';
      });
      crossed = false;
      setDrag(null);
    };

    const onStart = (e: TouchEvent) => {
      start = null;
      axis = null;
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      if (t.clientX < EDGE_GUARD || t.clientX > window.innerWidth - EDGE_GUARD) return;
      if ((e.target as HTMLElement | null)?.closest?.(IGNORE_TOUCH)) return;
      start = { x: t.clientX, y: t.clientY };
      blocks().forEach((el) => (el.style.transition = 'none'));
    };

    const onMove = (e: TouchEvent) => {
      if (!start) return;
      const t = e.touches[0];
      const dx = t.clientX - start.x;
      const dy = t.clientY - start.y;
      if (!axis) {
        if (Math.abs(dx) < 12 && Math.abs(dy) < 12) return;
        axis = Math.abs(dx) > Math.abs(dy) * 1.4 ? 'x' : 'y';
      }
      if (axis !== 'x') return;
      const to = dx < 0 ? nextRef.current : prevRef.current;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const follow = Math.sign(dx) * Math.min(MAX_FOLLOW, Math.abs(dx) * (to ? 0.35 : 0.1));
        if (!reduce()) blocks().forEach((el) => (el.style.transform = `translateX(${follow}px)`));
        const over = !!to && Math.abs(dx) >= threshold();
        if (over && !crossed) navigator.vibrate?.(12); // 기준을 넘는 순간 짧은 진동(지원 기기만)
        crossed = over;
        setDrag({ dx, ok: !!to });
      });
    };

    const onEnd = (e: TouchEvent) => {
      const s = start;
      const wasX = axis === 'x';
      start = null;
      axis = null;
      if (!s || !wasX) {
        reset();
        return;
      }
      const dx = (e.changedTouches[0]?.clientX ?? s.x) - s.x;
      const to = dx < 0 ? nextRef.current : prevRef.current;
      reset();
      if (to && Math.abs(dx) >= threshold()) go(to, 'swipe', dx < 0 ? 'next' : 'prev');
    };

    window.addEventListener('touchstart', onStart, { passive: true });
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onEnd, { passive: true });
    window.addEventListener('touchcancel', reset, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('touchstart', onStart);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onEnd);
      window.removeEventListener('touchcancel', reset);
    };
  }, [go]);

  const th = typeof window === 'undefined' ? 100 : Math.max(90, window.innerWidth * 0.25);
  const hintSide = drag && drag.ok && Math.abs(drag.dx) > 8 ? (drag.dx < 0 ? 'next' : 'prev') : null;
  const hintTarget = hintSide === 'next' ? next : hintSide === 'prev' ? prev : null;
  const p = drag ? Math.min(1, Math.abs(drag.dx) / th) : 0;

  return (
    <>
      <style>{`
        .an-edge { position: fixed; top: 50%; transform: translateY(-50%); z-index: 20; display: none; align-items: center; gap: 10px; color: #6b7280; text-decoration: none; }
        .an-edge-ico { width: 40px; height: 40px; border-radius: 999px; display: grid; place-items: center; background: #fff; border: 1px solid #e5e7eb; transition: border-color .15s, color .15s; }
        .an-edge:hover .an-edge-ico, .an-edge:focus-visible .an-edge-ico { color: #111827; border-color: #9ca3af; }
        .an-edge-tip { max-width: 220px; padding: 8px 12px; border-radius: 10px; background: #111827; color: #fff; font-size: 13px; line-height: 1.45; opacity: 0; pointer-events: none; transition: opacity .15s; word-break: keep-all; }
        .an-edge:hover .an-edge-tip, .an-edge:focus-visible .an-edge-tip { opacity: 1; }
        .an-edge-prev { left: 14px; }
        .an-edge-next { right: 14px; flex-direction: row-reverse; }
        @media (min-width: 1280px) { .an-edge { display: flex; } }
        .an-pull { position: fixed; top: 42%; z-index: 40; width: min(78vw, 300px); display: flex; align-items: center; gap: 12px; padding: 10px 14px 10px 10px; border-radius: 999px; background: #fff; color: #111827;
          box-shadow: 0 1px 2px rgba(17,24,39,.08), 0 10px 28px -8px rgba(17,24,39,.28); pointer-events: none; will-change: transform; }
        .an-pull-next { right: 0; flex-direction: row-reverse; padding: 10px 10px 10px 14px; text-align: right; transform: translateX(calc((1 - var(--p)) * (100% + 8px) - 8px)); }
        .an-pull-prev { left: 0; text-align: left; transform: translateX(calc((1 - var(--p)) * (-100% - 8px) + 8px)); }
        .an-pull-ico { flex: none; width: 44px; height: 44px; border-radius: 999px; display: grid; place-items: center; font-size: 20px; line-height: 1; color: #111827;
          background: conic-gradient(#5b8def calc(var(--p) * 360deg), #eef0f3 0); position: relative; }
        .an-pull-ico::before { content: ''; position: absolute; inset: 3px; border-radius: 999px; background: #fff; }
        .an-pull-ico i { position: relative; font-style: normal; }
        .an-pull[data-ready='true'] .an-pull-ico { color: #fff; background: #111827; }
        .an-pull[data-ready='true'] .an-pull-ico::before { background: #111827; }
        .an-pull-txt { min-width: 0; display: flex; flex-direction: column; gap: 1px; font-size: 12.5px; line-height: 1.4; word-break: keep-all; }
        .an-pull-txt b { font-size: 11.5px; font-weight: 700; color: #5b8def; }
        .an-pull[data-ready='true'] .an-pull-txt b { color: #111827; }
        .an-pull-txt span { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; color: #374151; }
        @media (min-width: 1280px) { .an-pull { display: none; } }
        @media (prefers-reduced-motion: reduce) { .an-edge-ico, .an-edge-tip { transition: none; } }
      `}</style>
      {prev && (
        <Link href={lensPath(prev)} prefetch={false} className="an-edge an-edge-prev" aria-label={`이전 기사: ${displayHeadline(prev.headline)}`} onClick={() => trackEvent('article_neighbor_click', { article_id: articleId, to_article_id: prev.id, direction: 'prev', method: 'edge' })}>
          <span className="an-edge-ico" aria-hidden>←</span>
          <span className="an-edge-tip">{displayHeadline(prev.headline)}</span>
        </Link>
      )}
      {next && (
        <Link href={lensPath(next)} prefetch={false} className="an-edge an-edge-next" aria-label={`다음 기사: ${displayHeadline(next.headline)}`} onClick={() => trackEvent('article_neighbor_click', { article_id: articleId, to_article_id: next.id, direction: 'next', method: 'edge' })}>
          <span className="an-edge-ico" aria-hidden>→</span>
          <span className="an-edge-tip">{displayHeadline(next.headline)}</span>
        </Link>
      )}
      {hintTarget && hintSide && (
        <div
          className={`an-pull an-pull-${hintSide}`}
          data-ready={p >= 1}
          style={{ '--p': p } as React.CSSProperties}
          aria-hidden
        >
          <span className="an-pull-ico">
            <i>{hintSide === 'next' ? '→' : '←'}</i>
          </span>
          <span className="an-pull-txt">
            <b>{p >= 1 ? '놓으면 이동해요' : hintSide === 'next' ? '다음 기사' : '이전 기사'}</b>
            <span>{displayHeadline(hintTarget.headline)}</span>
          </span>
        </div>
      )}
    </>
  );
}

/** 기사 맨 아래 이전/다음 기사 버튼 — 스와이프·키보드를 모르는 사람을 위한 눈에 보이는 이동 수단. */
export function ArticleNeighborLinks({ articleId, prev, next }: Neighbors & { articleId: string }) {
  if (!prev && !next) return null;
  const card = (to: ArticleNeighbor, dir: 'prev' | 'next') => (
    <Link
      href={lensPath(to)}
      prefetch={false}
      className={`anl anl-${dir}`}
      onClick={() => trackEvent('article_neighbor_click', { article_id: articleId, to_article_id: to.id, direction: dir, method: 'button', ...(to.category ? { category: to.category } : {}) })}
    >
      <span className="anl-dir">{dir === 'prev' ? '← 이전 기사' : '다음 기사 →'}</span>
      <span className="anl-title">{displayHeadline(to.headline)}</span>
    </Link>
  );
  return (
    <nav aria-label="이전·다음 기사" style={{ marginTop: 48 }}>
      <style>{`
        .anl-wrap { display: flex; gap: 10px; align-items: stretch; }
        .anl { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; padding: 14px 18px; border-radius: 16px; background: #f2f3f5; color: #111827; text-decoration: none; transition: background .15s ease; }
        .anl:hover { background: #e9ebef; }
        .anl:focus-visible { outline: 2px solid #5b8def; outline-offset: 2px; }
        .anl-prev { text-align: left; }
        .anl-next { text-align: right; }
        .anl-dir { font-size: 12px; font-weight: 700; color: #6b7280; }
        .anl-title { font-size: 15px; font-weight: 700; line-height: 1.45; word-break: keep-all; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
        @media (max-width: 520px) { .anl-wrap { flex-direction: column; } .anl-next { text-align: left; } }
      `}</style>
      <div className="anl-wrap">
        {prev ? card(prev, 'prev') : <span style={{ flex: 1 }} aria-hidden />}
        {next ? card(next, 'next') : <span style={{ flex: 1 }} aria-hidden />}
      </div>
    </nav>
  );
}
