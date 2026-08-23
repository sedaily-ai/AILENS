import { useEffect, useRef } from 'react';
import { trackEvent } from './trackEvent';

const THRESHOLDS = [25, 50, 75, 100] as const;

/**
 * KPI 계측(2026-08-23) — "완주" 축. 영상·팟캐스트의 재생 진행률을
 * 25/50/75/100%에서 각각 media_progress 이벤트로 한 번씩만 쏜다("얼마나
 * 오래 재생했나"가 아니라 "약속한 만큼 다 봤는가"를 잰다는 KPI 메모
 * 원칙 그대로). timeupdate는 브라우저마다 250ms~수 초 간격으로 불규칙하게
 * 오기 때문에, 정확히 그 %를 지날 때만이 아니라 "그 % 이상"이 될 때
 * 최초 1회로 처리한다.
 *
 * ref는 <video>/<audio> 엘리먼트를 가리켜야 한다. articleId가 없으면
 * (아직 데이터 로딩 전 등) 아무것도 안 한다.
 */
export function useMediaProgress(
  ref: React.RefObject<HTMLMediaElement | null>,
  articleId: string | null | undefined,
  format: string,
) {
  const firedRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    firedRef.current = new Set();
    const el = ref.current;
    if (!el || !articleId) return;

    const onTimeUpdate = () => {
      if (!el.duration || Number.isNaN(el.duration)) return;
      const pct = (el.currentTime / el.duration) * 100;
      for (const t of THRESHOLDS) {
        if (pct >= t && !firedRef.current.has(t)) {
          firedRef.current.add(t);
          trackEvent('media_progress', { article_id: articleId, format, pct: t });
        }
      }
    };
    const onEnded = () => {
      if (!firedRef.current.has(100)) {
        firedRef.current.add(100);
        trackEvent('media_progress', { article_id: articleId, format, pct: 100 });
      }
    };

    el.addEventListener('timeupdate', onTimeUpdate);
    el.addEventListener('ended', onEnded);
    return () => {
      el.removeEventListener('timeupdate', onTimeUpdate);
      el.removeEventListener('ended', onEnded);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [articleId, format]);
}
