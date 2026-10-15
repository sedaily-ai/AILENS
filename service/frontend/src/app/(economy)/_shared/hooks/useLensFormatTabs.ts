'use client';

import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { fetchLensBySlug, type CmsLens } from '@/shared/lib/api/cmsPostsApi';
import { trackEvent } from '@/shared/lib/tracking/trackEvent';
import { lensFormatFor, lensPanelId, parseLensView } from '@/shared/constants/lensPerspectives';
import { useNewsReadingSignal } from '@/entities/user';

/**
 * 기사 상세의 형식(레터·웹툰·팟캐스트·영상) 탭 상태.
 * 기사 로딩, 활성 탭, 딥링크(?v=N) 복원, 탭 전환 계측·스크롤, 키보드 이동, 실제 미디어 길이를 한곳에서 관리한다.
 */
export function useLensFormatTabs(slug: string, initialLens: CmsLens | null | undefined) {
  const [lens, setLens] = useState<CmsLens | null | undefined>(initialLens);
  const [active, setActive] = useState(0);
  useNewsReadingSignal(lens ? {
    id: lens.id, kind: 'news', title: lens.headline,
    categories: lens.category ? [lens.category] : [],
    keywords: [...new Set((lens.lenses ?? []).flatMap((item) => (item.keywords ?? []).map((word) => word.term)))].slice(0, 30),
  } : null, lensFormatFor(lens?.lenses?.[active], active));
  // 실제 오디오·영상 길이(초). loadedmetadata에서만 채워 임의의 길이를 표시하지 않는다(lensSamples.ts의 clock() 참조).
  const [mediaDur, setMediaDur] = useState<Record<number, number>>({});
  // 직전 이동 방향(-1 왼쪽 / 0 없음 / +1 오른쪽). 인디케이터와 본문 진입 방향을 맞추는 데만 쓴다.
  const [dir, setDir] = useState(0);
  // 형식 설명(.fmt-toast) 표시 여부. 탭을 고르면 표시되고 다른 탭을 고르기 전까지 유지되어 레이아웃이 저절로 움직이지 않는다.
  const [showDesc, setShowDesc] = useState(false);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [scrollRequest, setScrollRequest] = useState<{ index: number; target: 'description' | 'panel' } | null>(null);

  // 탭과 설명이 DOM에 반영된 뒤 이동한다. 같은 탭의 듣기를 다시 눌러도 새 요청으로 처리한다.
  useEffect(() => {
    if (!scrollRequest) return;
    const raf = requestAnimationFrame(() => {
      const panel = document.getElementById(lensPanelId(scrollRequest.index));
      const el = scrollRequest.target === 'panel' ? panel : document.getElementById('lens-desc') ?? panel;
      if (!el || panel?.hidden) return;
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
    });
    return () => cancelAnimationFrame(raf);
  }, [scrollRequest]);
  const noteDur = useCallback((i: number, raw: number) => {
    if (!Number.isFinite(raw) || raw <= 0) return;
    setMediaDur((cur) => (cur[i] === raw ? cur : { ...cur, [i]: raw }));
  }, []);

  useEffect(() => {
    if (!slug || initialLens) return;
    let cancelled = false;
    fetchLensBySlug(slug).then((l) => {
      if (!cancelled) setLens(l);
    });
    return () => {
      cancelled = true;
    };
  }, [slug, initialLens]);

  const count = lens?.lenses?.length ?? 0;

  // 홈에서 고른 시선(?v=N)을 연다. 제목·사진·리드가 맥락을 주므로 스크롤은 건드리지 않는다.
  useEffect(() => {
    if (count === 0) return;
    const explicit = parseLensView(window.location.search);
    const preferred = new URLSearchParams(window.location.search).get('format');
    const i = explicit ?? (preferred ? lens?.lenses?.findIndex((item,index)=>lensFormatFor(item,index)===preferred) ?? -1 : -1);
    if (i < 0 || i >= count) return;
    const raf = requestAnimationFrame(() => setActive(i));
    return () => cancelAnimationFrame(raf);
    // 딥링크 진입에서는 설명(showDesc)을 띄우지 않는다. 탭을 직접 누르면(select()) 표시된다.
  }, [count, lens]);

  // KPI 계측(포맷 전환율)과 방향성 전환·형식 설명 토스트. setActive를 함수형 업데이트로 호출해 deps 없이 직전 active를 읽는다.
  // select는 useCallback([])로 유지해야 tabRefs 등의 참조가 깨지지 않는다.
  const select = useCallback((i: number, scrollTarget: 'description' | 'panel' = 'description') => {
    setActive((prev) => {
      if (prev !== i && lens) {
        trackEvent('format_switch', {
          article_id: lens.id,
          from_format: lensFormatFor(lens.lenses?.[prev], prev),
          to_format: lensFormatFor(lens.lenses?.[i], i),
          ...(lens.category ? { category: lens.category } : {}),
        });
      }
      setDir(i > prev ? 1 : i < prev ? -1 : 0);
      return i;
    });
    setShowDesc(true);
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    url.searchParams.set('v', String(i + 1));
    window.history.replaceState(null, '', url);
    setScrollRequest({ index: i, target: scrollTarget });
  }, [lens]);

  // 좌우 스와이프는 이전/다음 기사 이동(ArticleNeighborNav)이 쓴다. 형식 전환은 상단 탭과 패널 하단 버튼(FormatStepNav)이 맡는다.

  const onTabKeyDown = useCallback(
    (e: ReactKeyboardEvent, i: number) => {
      if (count === 0) return;
      let next: number | null = null;
      if (e.key === 'ArrowRight') next = (i + 1) % count;
      else if (e.key === 'ArrowLeft') next = (i - 1 + count) % count;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = count - 1;
      if (next === null) return;
      e.preventDefault();
      select(next);
      tabRefs.current[next]?.focus();
    },
    [count, select],
  );

  return { lens, active, count, dir, showDesc, mediaDur, noteDur, tabRefs, select, onTabKeyDown };
}
