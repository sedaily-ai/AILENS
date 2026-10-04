import { useEffect, useRef } from 'react';
import { trackEvent } from './trackEvent';

/**
 * KPI 계측(2026-08-23) — "완주" 축, 웹툰용. 컷 각각이 화면에 절반 이상
 * 보이는 순간 webtoon_cut_view를 컷당 한 번만 쏜다. 스크롤 속도·화면
 * 크기와 무관하게 "실제로 그 컷을 지나갔는가"를 재는 게 목적이라 IntersectionObserver
 * threshold 0.5(절반 이상 보임)를 기준으로 한다 — 스크롤하다 스치기만
 * 한 컷까지 "봤다"고 잡히지 않게.
 *
 * 2026-10-03 확장 — 웹툰식 말풍선으로 바꾼 효과를 숫자로 보려고:
 *  - 모든 이벤트에 variant(v1 기존 / v2 웹툰식)와 total_cuts를 싣는다(스타일별·컷 수별 비교)
 *  - webtoon_start : 첫 컷이 보인 순간 1회(분모)
 *  - webtoon_complete : 마지막 컷에 도달한 순간 1회(완주). elapsed_s = 시작부터 걸린 초(읽는 속도), reached = 그때까지 본 컷 수
 *
 * containerRef 안에서 [data-cut-index] 속성이 달린 자식 엘리먼트를 전부
 * 관찰한다. articleId가 없으면 관찰 자체를 시작하지 않는다.
 */
export function useCutViewTracking(
  containerRef: React.RefObject<HTMLElement | null>,
  articleId: string | null | undefined,
  totalCuts: number,
  variant: 'v1' | 'v2' = 'v1',
  category?: string | null,
) {
  const firedRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    firedRef.current = new Set();
    const container = containerRef.current;
    if (!container || !articleId || totalCuts === 0) return;

    const nodes = container.querySelectorAll<HTMLElement>('[data-cut-index]');
    if (nodes.length === 0) return;

    let startedAt: number | null = null;
    let completed = false;
    // category(증시·부동산 등, 2026-10-03) — 주제별 웹툰 반응 비교용. 없으면 키 자체를 뺀다.
    const common = { article_id: articleId, variant, total_cuts: totalCuts, ...(category ? { category } : {}) };

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const idx = Number(entry.target.getAttribute('data-cut-index'));
          if (Number.isNaN(idx) || firedRef.current.has(idx)) continue;
          firedRef.current.add(idx);
          if (startedAt === null) {
            startedAt = Date.now();
            trackEvent('webtoon_start', common);
          }
          trackEvent('webtoon_cut_view', { ...common, cut_index: idx });
          if (!completed && idx >= totalCuts) {
            completed = true;
            trackEvent('webtoon_complete', {
              ...common,
              reached: firedRef.current.size,
              elapsed_s: Math.round((Date.now() - startedAt) / 1000),
            });
          }
          if (firedRef.current.size >= totalCuts) observer.disconnect();
        }
      },
      { threshold: 0.5 },
    );
    nodes.forEach((n) => observer.observe(n));
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articleId, totalCuts, variant, category]);
}
