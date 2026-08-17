'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { NewsTimeMachine } from '@/features/timeline';

// 공용 Header 대신 좌상단 EXIT 필 — /timeline/[date](TimelineDayClient.tsx)와
// 같은 이유·같은 톤(2026-08-17, "완전 몰입형 공간" 취급을 /timeline 전체로
// 확장). ConditionalFooter.tsx가 이미 이 경로의 공용 푸터를 숨기고 있다.
export default function TimelinePage() {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 시 1회 ready 플래그
    setReady(true);
  }, []);

  if (!ready) {
    return <div className="min-h-screen" style={{ background: '#faf8f3' }} />;
  }

  return (
    <div className="min-h-screen" style={{ background: '#faf8f3' }}>
      <Link
        href="/"
        aria-label="AI LENS 로 돌아가기"
        style={{
          position: 'fixed',
          top: 20,
          left: 20,
          zIndex: 60,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 16px',
          background: '#fff',
          border: '1px solid #e6e0d4',
          borderRadius: 999,
          color: '#2a2622',
          fontSize: 12.5,
          fontWeight: 700,
          letterSpacing: '0.02em',
          textDecoration: 'none',
          boxShadow: '0 2px 10px rgba(80,60,30,0.08)',
          transition: 'all 0.18s',
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = '#fdfcf9';
          e.currentTarget.style.borderColor = '#d8cfb8';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = '#fff';
          e.currentTarget.style.borderColor = '#e6e0d4';
        }}
      >
        ◀ AI LENS
      </Link>

      <main>
        <NewsTimeMachine />
      </main>
    </div>
  );
}
