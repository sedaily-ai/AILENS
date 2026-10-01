'use client';

import { useState } from 'react';
import Link from 'next/link';
import { X } from 'lucide-react';

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

  // 2차 리디자인(2026-10-01, 사용자 피드백 — 히어로 이미지 전에 쌓인
  // 줄이 너무 많다는 지적과 함께 이 배너도 "깔끔하게" 지적받음) — 토스
  // 블루 스파클 아이콘을 뺐다. 페이지 전체가 잉크/그레이 톤인데 이
  // 배너만 유일하게 색이 있는 아이콘을 달고 맨 위에 떠 있어서 오히려
  // 눈에 먼저 걸렸다(사주 위젯 등 다른 블루 포인트는 사이드바 쪽이라
  // 본문 맨 위와 안 겹친다). 텍스트도 한 톤 낮춰(#374151→#6b7280)
  // "제목"이 아니라 "작은 보조 링크"로 읽히게 했다 — 기능(디스미스
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
      <Link
        href="/start"
        className="group-hover:text-gray-900 transition-colors"
        style={{
          flex: 1,
          minWidth: 0,
          fontSize: 12.5,
          fontWeight: 500,
          color: '#6b7280',
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
