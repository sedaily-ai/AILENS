// GA4 커스텀 이벤트 전송 — layout.tsx 에서 로드한 gtag.js 가 window.gtag 를 주입.
// 포팅한 ideal-match / couple-match 컴포넌트가 이 함수를 호출.

declare global {
  interface Window {
    gtag?: (command: 'event' | 'config' | 'js' | 'set', ...args: unknown[]) => void;
  }
}

export function trackEvent(name: string, params?: Record<string, unknown>) {
  if (typeof window === 'undefined') return;
  try {
    if (typeof window.gtag === 'function') {
      window.gtag('event', name, params ?? {});
    }
  } catch {
    /* gtag 미로드 환경에선 무시 */
  }
  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.debug('[trackEvent]', name, params);
  }
}
