'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { X, Sparkles } from 'lucide-react';
import { isOnboardingCompleted, isDiscoveryBannerDismissed, dismissDiscoveryBanner } from '../lib/onboardingStorage';

/**
 * 메인 피드 상단 — 온보딩(/start) 발견 배너.
 *
 * 배경: /start를 만들었지만 실제 진입 경로가 헤더엔 없고(2026-08-06 결정 —
 * 온보딩 랜딩은 외부 유입 전용, 상시 링크 없음) 푸터의 "서비스 소개" →
 * /onboarding 히어로 CTA를 거쳐야만 닿는 2단계 경로였다 — 기존 방문자는
 * 사실상 발견할 방법이 없었다(신규가입 직후 자동 리다이렉트만 실제 경로).
 * 헤더에 상시 링크를 다시 넣는 대신(그 결정을 뒤집을 근거는 아직 없음)
 * 메인 피드에 조건부 배너를 얹는다 — 로그인 안 한 방문자한테만, 닫으면
 * 다시 안 뜬다.
 */
export function DiscoveryBanner({ loggedIn }: { loggedIn: boolean }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (loggedIn) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 시 localStorage 1회 읽기(LensPreviewSection.tsx:93, NewsTimeMachine.tsx:62와 같은 관례). 렌더 중에는 읽을 수 없다 — 서버에는 localStorage가 없어 하이드레이션이 깨진다.
    if (!isOnboardingCompleted() && !isDiscoveryBannerDismissed()) setVisible(true);
  }, [loggedIn]);

  if (!visible) return null;

  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        width: '100%',
        margin: '0 0 16px',
        padding: '12px 14px',
        borderRadius: 12,
        background: '#eff6ff',
        border: '1px solid #dbeafe',
        boxSizing: 'border-box',
      }}
    >
      <Sparkles size={16} color="#3182F6" strokeWidth={2} style={{ flexShrink: 0 }} />
      <Link
        href="/start"
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: 13,
          fontWeight: 600,
          color: '#1d4ed8',
          textDecoration: 'none',
        }}
      >
        나에게 맞는 콘텐츠 유형, 1분 만에 찾아보기 →
      </Link>
      <button
        type="button"
        aria-label="배너 닫기"
        onClick={() => {
          dismissDiscoveryBanner();
          setVisible(false);
        }}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'none',
          border: 'none',
          padding: 4,
          cursor: 'pointer',
          flexShrink: 0,
          color: '#93c5fd',
        }}
      >
        <X size={15} strokeWidth={2} />
      </button>
    </div>
  );
}
