'use client';

import { Suspense, useEffect } from 'react';
import { AuthProvider } from '@/features/auth';
import { NavProgress } from '@/widgets/NavProgress';
import { trackEvent } from '@/shared/lib/tracking/trackEvent';
import { reportWebVitals } from '@/shared/lib/tracking/webVitals';

// 속도 KPI 계측(2026-08-23, "전체적으로 더 빠르게 하려면?" 대화의 연장).
// web-vitals는 브라우저 Navigation/Paint API를 직접 관찰하는 방식이라
// 실제 문서 로드(하드 리프레시/첫 진입) 1회에 대해서만 의미가 있다 —
// Next.js 클라이언트 사이드 라우팅(<Link> 이동)은 이 지표들이 다시
// 재발생하는 게 아니라서, SessionSourceTracker와 같은 패턴으로 앱 루트
// 마운트 시 1회만 리스너를 건다.
function WebVitalsTracker() {
  useEffect(() => {
    reportWebVitals();
  }, []);
  return null;
}

// KPI 계측(2026-08-23) — "습관 재방문" 축. 알림 클릭으로 온 세션과 스스로
// 돌아온(직접/즐겨찾기/검색 등) 세션을 구분한다. 지금은 AI LENS에 푸시
// 알림 인프라가 없어서 utm_source가 있을 일이 아직 없지만, 알림이든
// 뉴스레터 캠페인이든 앞으로 만들 모든 외부 유입 링크에 ?utm_source=...
// 만 붙이면 이 이벤트가 자동으로 구분해준다 — 인프라를 미리 깔아두는
// 쪽이, 나중에 알림이 생기고 나서야 계측을 추가하는 것보다 낫다고 판단.
// sessionStorage로 세션당 1회만 쏜다(탭을 새로고침해도 다시 안 쏨).
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
      {/* useSearchParams 사용 — 정적 export 빌드에서 Suspense 경계 필수 */}
      <Suspense fallback={null}>
        <NavProgress />
      </Suspense>
      <SessionSourceTracker />
      <WebVitalsTracker />
      {children}
    </AuthProvider>
  );
}
