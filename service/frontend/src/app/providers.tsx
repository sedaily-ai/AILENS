'use client';

import { useEffect } from 'react';
import { AuthProvider } from '@/features/auth';
import { trackEvent } from '@/shared/lib/tracking/trackEvent';
import { reportWebVitals } from '@/shared/lib/tracking/webVitals';
import { LinkPrefetcher } from '@/shared/ui/effects/LinkPrefetcher';

// 속도 KPI 계측. web-vitals는 브라우저 Navigation/Paint API를 직접 관찰하므로 실제 문서 로드(하드 리프레시/첫 진입) 1회에만 의미가 있다.
// 클라이언트 사이드 라우팅(<Link> 이동)에서는 지표가 재발생하지 않으므로, SessionSourceTracker와 같은 패턴으로 앱 루트 마운트 시 1회만 리스너를 건다.
function WebVitalsTracker() {
  useEffect(() => {
    reportWebVitals();
  }, []);
  return null;
}

// KPI 계측 — "습관 재방문" 축. 알림 클릭으로 온 세션과 스스로 돌아온(직접/즐겨찾기/검색 등) 세션을 구분한다.
// 외부 유입 링크에 ?utm_source=...만 붙이면 이 이벤트가 자동으로 구분한다. sessionStorage로 세션당 1회만 발송한다(새로고침해도 재발송하지 않음).
function SessionSourceTracker() {
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const KEY = 'ailens_session_source_sent';
    if (sessionStorage.getItem(KEY)) return;
    sessionStorage.setItem(KEY, '1');
    const utmSource = new URLSearchParams(window.location.search).get('utm_source');
    trackEvent('session_source', { source: utmSource || 'direct' });
  }, []);
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <SessionSourceTracker />
      <WebVitalsTracker />
      <LinkPrefetcher />
      {children}
    </AuthProvider>
  );
}
