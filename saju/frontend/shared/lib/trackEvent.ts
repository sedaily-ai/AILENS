/**
 * GA4 이벤트 전송 유틸
 *
 * 사용 예:
 *   import { trackEvent } from '@saju/shared/lib/trackEvent';
 *   trackEvent('saju_calculate', { gender: '남', has_time: true });
 *
 * - gtag 함수가 로드돼 있지 않으면 조용히 무시 (로컬·프리뷰 환경 안전)
 * - 모든 이벤트는 GA4 표준 대로 event_category / event_label 없이 파라미터 자유 형식
 */

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (command: 'event' | 'config' | 'js' | 'set', ...args: unknown[]) => void;
  }
}

export function trackEvent(
  eventName: string,
  params?: Record<string, string | number | boolean | undefined>,
): void {
  if (typeof window === 'undefined') return;
  // 개인 트래픽 opt-out — GoogleAnalytics.tsx 의 GA_DISABLED_KEY 와 동일 키
  try {
    if (window.localStorage.getItem('ga_disabled') === 'true') return;
  } catch {}
  if (typeof window.gtag !== 'function') return;
  window.gtag('event', eventName, params || {});
}
