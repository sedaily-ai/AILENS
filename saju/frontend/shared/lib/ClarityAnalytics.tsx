'use client';

/**
 * Microsoft Clarity — 세션 녹화 + 히트맵 + rage click 자동 감지
 *
 * - 빌드 시점 `NEXT_PUBLIC_CLARITY_PROJECT_ID` 환경변수로 프로젝트 ID 주입 (10자리 영숫자)
 * - 런타임에 hostname 이 `CLARITY_HOSTNAMES` 에 포함될 때만 스크립트 로드
 * - `ga_disable=1` 로 설정된 브라우저에서는 GA4 와 동일하게 추적 차단
 * - GA4 와의 연결은 Clarity 대시보드 Setup → Google Analytics 메뉴에서 설정
 *
 * 새 호스트 추가 시 CLARITY_HOSTNAMES 배열만 확장하면 됨.
 */

import Script from 'next/script';
import { useEffect, useState } from 'react';
import { GA_DISABLED_KEY } from './GoogleAnalytics';

const CLARITY_ID = process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID;

const CLARITY_HOSTNAMES = ['saju.sedaily.ai'];

export function ClarityAnalytics() {
  const [shouldLoad, setShouldLoad] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      if (localStorage.getItem(GA_DISABLED_KEY) === 'true') return;
    } catch {}

    if (!CLARITY_ID) return;
    if (!CLARITY_HOSTNAMES.includes(window.location.hostname)) return;
    setShouldLoad(true);
  }, []);

  if (!shouldLoad || !CLARITY_ID) return null;

  return (
    <Script id="clarity-init" strategy="afterInteractive">
      {`
        (function(c,l,a,r,i,t,y){
          c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};
          t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;
          y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);
        })(window, document, "clarity", "script", "${CLARITY_ID}");
      `}
    </Script>
  );
}
