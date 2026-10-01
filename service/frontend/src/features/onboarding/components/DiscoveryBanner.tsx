'use client';

import { useState } from 'react';
import Link from 'next/link';
import { X, Sparkles } from 'lucide-react';

/**
 * 메인 피드 상단 — 온보딩(/start) 발견 배너.
 *
 * 배경: /start를 만들었지만 실제 진입 경로가 헤더엔 없고(2026-08-06 결정 —
 * 온보딩 랜딩은 외부 유입 전용, 상시 링크 없음) 푸터의 "서비스 소개" →
 * /onboarding 히어로 CTA를 거쳐야만 닿는 2단계 경로였다 — 기존 방문자는
 * 사실상 발견할 방법이 없었다.
 *
 * 2026-09 — 처음엔 "로그인 안 한 방문자 + 온보딩 미완료"로만 조건부
 * 노출했는데, 그러면 로그인해서 보는 사람(운영자 포함) 눈엔 아예 안 보여
 * "안 뜬다"는 오해를 샀다. 지금은 로그인/이전 방문 기록과 무관하게 항상
 * 뜬다 — X는 이번 페이지 뷰에서만 숨기고(로컬 컴포넌트 state), 새로고침·
 * 재방문하면 다시 뜬다. 발견 경로 자체가 아직 부실한 단계라 "상시 노출"이
 * 지금은 맞는 선택.
 */
export function DiscoveryBanner() {
  const [visible, setVisible] = useState(true);

  if (!visible) return null;

  // 리디자인(2026-09-30) — 박스(배경+테두리) 대신 슬림한 한 줄 텍스트로.
  // 헤더 바로 아래, 실제 제품 가치(오늘의 이슈)보다도 앞자리에 있는 유일한
  // 요소라 "박스 위에 박스"로 안 보이게 시각 무게를 최소화 — 기능(디스미스
  // 가능한 /start 발견 배너)은 그대로 유지.
  return (
    <div
      className="group"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        width: '100%',
        margin: '0 0 14px',
      }}
    >
      <Sparkles size={14} color="#3182F6" strokeWidth={2.2} style={{ flexShrink: 0 }} />
      <Link
        href="/start"
        className="group-hover:text-blue-700 transition-colors"
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: 13,
          fontWeight: 600,
          color: '#374151',
          textDecoration: 'none',
        }}
      >
        나에게 맞는 콘텐츠 유형, 1분 만에 찾아보기 →
      </Link>
      <button
        type="button"
        aria-label="배너 닫기"
        onClick={() => setVisible(false)}
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'none',
          border: 'none',
          padding: 4,
          cursor: 'pointer',
          flexShrink: 0,
          color: '#c7cdd6',
        }}
      >
        <X size={14} strokeWidth={2} />
      </button>
    </div>
  );
}
