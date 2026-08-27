'use client';

import { useEffect, useState } from 'react';
import { AuthProvider } from '@/features/auth';
import { trackEvent } from '@/shared/lib/tracking/trackEvent';
import { reportWebVitals } from '@/shared/lib/tracking/webVitals';
import { SplashScreen } from '@/shared/ui/SplashScreen';

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

// 2026-08-25 신설 — 피그마 핸드오프 스플래시(SplashScreen)를 세션당 1회만
// 보여준다. NavProgress를 걷어낸 것과 같은 이유로, 클라이언트 사이드
// 페이지 이동(<Link>)마다 매번 재생하면 "바로바로 이동" 요청과 정면으로
// 충돌한다 — SessionSourceTracker와 동일한 sessionStorage 1회 패턴을 그대로
// 재사용해, 진짜 앱을 새로 여는 순간(첫 하드 로드)에만 뜨게 한다.
//
// 기본값을 true로 시작한다(2026-08-25, 사용자 지적 — "메인 화면이 먼저
// 뜨고 스플래시가 나중에 뜨는 경우가 있다"). 처음엔 false로 시작해서
// effect가 sessionStorage를 확인한 뒤에야 true로 켰는데, 그러면 effect가
// 도는 그 짧은 순간 동안 메인 콘텐츠(SSR로 이미 완성돼 있음)가 항상 먼저
// 그려지고 스플래시가 그 위에 뒤늦게 얹히는 순서가 됐다. 서버·클라이언트
// 첫 렌더 모두 true로 시작하면(하이드레이션 불일치 없음 — 둘 다 같은 값)
// 스플래시가 항상 먼저 보이고, 이미 이번 세션에 본 적 있으면 effect가
// 즉시 꺼서 재생 없이 넘어간다.
//
// 2026-08-27 — 이 스플래시는 원래 앱(TWA)용으로 만든 것인데 일반 브라우저
// 접속(ailens.sedaily.ai를 그냥 웹으로 여는 경우)에도 똑같이 떴다("앱용이라"
// — 사용자 지적). TWA로 열렸는지는 `document.referrer`가
// `android-app://<패키지>` 형태인지로 구분한다(구글이 공식 문서화한 TWA
// 판별법 — 오늘 TWA가 항상 Chrome을 쓰도록 provider를 고정해서 이 값이
// 안정적으로 찍힘). 서버 렌더 시점엔 이 값을 알 수 없어 SSR·첫 클라이언트
// 렌더는 여전히 true로 시작하지만(하이드레이션 일치 유지), effect가 그
// 직후 바로 판정해 앱이 아니면 즉시 끈다 — 실제로는 한 프레임도 안 되는
// 찰나라 웹에서는 사실상 안 보인다.
function SplashGate() {
  const [show, setShow] = useState(true);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const isTwa = document.referrer.startsWith('android-app://');
    if (!isTwa) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- referrer는 서버에 없어 마운트 후 1회 판정 필요(SessionSourceTracker와 동일 관례).
      setShow(false);
      return;
    }
    const KEY = 'ailens_splash_shown';
    if (sessionStorage.getItem(KEY)) {
      setShow(false);
      return;
    }
    sessionStorage.setItem(KEY, '1');
  }, []);
  if (!show) return null;
  return <SplashScreen onDone={() => setShow(false)} />;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      {/* 상단 진행 바(NavProgress)는 2026-08-23 제거 — "바로바로 이동" 요청과
          충돌: 실제 전환이 끝나도 최소 460ms짜리 페이드아웃 애니메이션을
          강제로 재생해서, prefetch+staleTimes로 진짜 빨라진 전환을 오히려
          더 느리게 느껴지게 만들었다(컴포넌트 자체는 widgets/NavProgress에
          남겨둠 — 필요해지면 되돌릴 수 있게). */}
      <SplashGate />
      <SessionSourceTracker />
      <WebVitalsTracker />
      {children}
    </AuthProvider>
  );
}
