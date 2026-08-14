'use client';

/**
 * GA4 (Google Analytics 4) 로더
 *
 * - 빌드 시점 `NEXT_PUBLIC_GA_MEASUREMENT_ID` 환경변수로 측정 ID 주입 (예: G-XXXXXXXXXX)
 * - 런타임에 hostname 이 `GA_HOSTNAMES` 에 포함될 때만 스크립트 로드
 * - gtag 스크립트는 afterInteractive 전략 (LCP 영향 최소화)
 *
 * 개인 트래픽 제외:
 *  - `?ga_disable=1` 방문 시 localStorage 플래그 저장 → 이후 스크립트 로드 차단
 *  - `?ga_enable=1` 방문 시 재활성화
 *
 * 새 호스트 추가 시 GA_HOSTNAMES 배열만 확장하면 됨.
 * 이벤트 추적은 shared/lib/trackEvent 유틸 사용.
 */

import Script from 'next/script';
import { useEffect, useState } from 'react';

const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

// GA4 를 로드할 호스트 화이트리스트 — 실수로 로컬호스트·PR 프리뷰에 적재되는 걸 방지
const GA_HOSTNAMES = ['saju.sedaily.ai'];

// localStorage opt-out 키 — trackEvent 유틸도 같은 키를 참조
export const GA_DISABLED_KEY = 'ga_disabled';

export function GoogleAnalytics() {
  const [shouldLoad, setShouldLoad] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // URL 파라미터로 opt-out 토글
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get('ga_disable') === '1') {
        localStorage.setItem(GA_DISABLED_KEY, 'true');
        console.info('[GA4] 이 브라우저에서 추적 비활성화됨');
      } else if (params.get('ga_enable') === '1') {
        localStorage.removeItem(GA_DISABLED_KEY);
        console.info('[GA4] 이 브라우저에서 추적 재활성화됨');
      }
      if (localStorage.getItem(GA_DISABLED_KEY) === 'true') return;
    } catch {}

    if (!GA_ID) return;
    if (!GA_HOSTNAMES.includes(window.location.hostname)) return;
    setShouldLoad(true);
  }, []);

  if (!shouldLoad || !GA_ID) return null;

  return (
    <>
      <Script
        id="ga-loader"
        strategy="afterInteractive"
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
      />
      <Script id="ga-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${GA_ID}', {
            page_path: window.location.pathname + window.location.search,
            anonymize_ip: true,
          });
        `}
      </Script>
    </>
  );
}
