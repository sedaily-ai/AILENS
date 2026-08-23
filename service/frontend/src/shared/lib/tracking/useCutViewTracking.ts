import { useEffect, useRef } from 'react';
import { trackEvent } from './trackEvent';

/**
 * KPI 계측(2026-08-23) — "완주" 축, 웹툰용. 8컷 각각이 화면에 절반 이상
 * 보이는 순간 webtoon_cut_view를 컷당 한 번만 쏜다. 스크롤 속도·화면
 * 크기와 무관하게 "실제로 그 컷을 지나갔는가"를 재는 게 목적이라 IntersectionObserver
 * threshold 0.5(절반 이상 보임)를 기준으로 한다 — 스크롤하다 스치기만
 * 한 컷까지 "봤다"고 잡히지 않게.
 *
 * containerRef 안에서 [data-cut-index] 속성이 달린 자식 엘리먼트를 전부
 * 관찰한다. articleId가 없으면 관찰 자체를 시작하지 않는다.
 */
export function useCutViewTracking(
  containerRef: React.RefObject<HTMLElement | null>,
  articleId: string | null | undefined,
  totalCuts: number,
) {
  const firedRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    firedRef.current = new Set();
    const container = containerRef.current;
    if (!container || !articleId || totalCuts === 0) return;

    const nodes = container.querySelectorAll<HTMLElement>('[data-cut-index]');
    if (nodes.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const idx = Number(entry.target.getAttribute('data-cut-index'));
          if (Number.isNaN(idx) || firedRef.current.has(idx)) continue;
          firedRef.current.add(idx);
          trackEvent('webtoon_cut_view', { article_id: articleId, cut_index: idx });
          if (firedRef.current.size >= totalCuts) observer.disconnect();
        }
      },
      { threshold: 0.5 },
    );
    nodes.forEach((n) => observer.observe(n));
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articleId, totalCuts]);
}
