// GA4 커스텀 이벤트 전송. layout.tsx에서 로드한 gtag.js가 window.gtag를 주입한다.

declare global {
  interface Window {
    gtag?: (command: 'event' | 'config' | 'js' | 'set', ...args: unknown[]) => void;
    /** Microsoft Clarity — 스니펫이 설치돼 있을 때만 존재. 없으면 아래 연동은 아무 일도 안 한다. */
    clarity?: (command: 'set' | 'event' | 'identify' | 'consent', ...args: unknown[]) => void;
  }
}

// Clarity 연동: GA4로 보내는 이벤트를 Clarity에도 반영해 "이 사용자의 세션 녹화"를 바로 찾게 한다.
// 이벤트는 목표 행동만 보내고(이벤트 이름 수가 많아지면 필터가 지저분해진다), 태그는 비교 축(웹툰 방식·카테고리·형식)만 올린다.
const CLARITY_EVENTS = new Set(['webtoon_complete', 'webtoon_cta_click', 'newsletter_subscribe', 'letter_complete', 'format_switch']);
const CLARITY_TAG_KEYS = ['variant', 'category', 'to_format', 'format'] as const;

// 같은 값을 컷마다 다시 보내지 않도록 마지막으로 보낸 태그 값을 기억한다(값이 바뀔 때만 전송).
const clarityTagSent: Record<string, string> = {};

function mirrorToClarity(name: string, params?: Record<string, unknown>) {
  const c = window.clarity;
  if (typeof c !== 'function') return;
  try {
    for (const k of CLARITY_TAG_KEYS) {
      const v = params?.[k];
      if (typeof v !== 'string' || !v) continue;
      const tag = k === 'to_format' ? 'format' : k;
      if (clarityTagSent[tag] === v) continue;
      clarityTagSent[tag] = v;
      c('set', tag, v);
    }
    if (CLARITY_EVENTS.has(name)) c('event', name);
  } catch {
    /* Clarity 오류는 무시 */
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
  mirrorToClarity(name, params);
  if (process.env.NODE_ENV !== 'production') {
    console.debug('[trackEvent]', name, params);
  }
}
