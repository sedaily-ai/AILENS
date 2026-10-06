'use client';

import { useCallback, useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { fetchLensBySlug, type CmsLens } from '@/shared/lib/api/cmsPostsApi';
import { trackEvent } from '@/shared/lib/tracking/trackEvent';
import { lensFormatAt, lensPanelId, parseLensView } from '@/shared/constants/lensPerspectives';

/**
 * 기사 상세의 형식(레터·웹툰·팟캐스트·영상) 탭 상태.
 * 기사 로딩, 활성 탭, 딥링크(?v=N) 복원, 탭 전환 계측·스크롤, 키보드 이동, 실제 미디어 길이를 한곳에서 관리한다.
 */
export function useLensFormatTabs(slug: string, initialLens: CmsLens | null | undefined) {
  const [lens, setLens] = useState<CmsLens | null | undefined>(initialLens);
  const [active, setActive] = useState(0);
  // 실제 오디오·영상 길이(초). loadedmetadata에서만 채워 임의의 길이를 표시하지 않는다(lensSamples.ts의 clock() 참조).
  const [mediaDur, setMediaDur] = useState<Record<number, number>>({});
  // 직전 이동 방향(-1 왼쪽 / 0 없음 / +1 오른쪽). 인디케이터와 본문 진입 방향을 맞추는 데만 쓴다.
  const [dir, setDir] = useState(0);
  // 형식 설명(.fmt-toast) 표시 여부. 탭을 고르면 표시되고 다른 탭을 고르기 전까지 유지되어 레이아웃이 저절로 움직이지 않는다.
  const [showDesc, setShowDesc] = useState(false);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const noteDur = useCallback((i: number, raw: number) => {
    if (!Number.isFinite(raw) || raw <= 0) return;
    const sec = Math.round(raw);
    setMediaDur((cur) => (cur[i] === sec ? cur : { ...cur, [i]: sec }));
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
    const i = parseLensView(window.location.search);
    if (i === null || i >= count) return;
    const raf = requestAnimationFrame(() => setActive(i));
    return () => cancelAnimationFrame(raf);
    // 딥링크 진입에서는 설명(showDesc)을 띄우지 않는다. 탭을 직접 누르면(select()) 표시된다.
  }, [count]);

  // KPI 계측(포맷 전환율)과 방향성 전환·형식 설명 토스트. setActive를 함수형 업데이트로 호출해 deps 없이 직전 active를 읽는다.
  // select는 useCallback([])로 유지해야 tabRefs 등의 참조가 깨지지 않는다.
  const select = useCallback((i: number) => {
    setActive((prev) => {
      if (prev !== i && lens) {
        trackEvent('format_switch', {
          article_id: lens.id,
          from_format: lensFormatAt(prev),
          to_format: lensFormatAt(i),
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
    // ⚠️ rAF 안에서 스크롤한다. setActive() 직후 같은 tick에 scrollIntoView를 부르면 대상 패널이 아직 hidden이라 스크롤되지 않는다.
    // 목적지는 패널(lens-N)이 아니라 형식 설명(#lens-desc)이다. 패널 상단까지만 당기면 탭 아래 설명 문구가 화면 밖에 남을 수 있다.
    // block:'nearest'는 이미 보이면 움직이지 않고 밖에 있을 때만 최소한으로 당긴다.
    requestAnimationFrame(() => {
      const el = document.getElementById('lens-desc') ?? document.getElementById(lensPanelId(i));
      if (!el) return;
      const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
      el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'nearest' });
    });
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
