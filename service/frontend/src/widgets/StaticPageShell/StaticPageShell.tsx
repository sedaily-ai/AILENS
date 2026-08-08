'use client';

import { useState } from 'react';
import { Header } from '@/widgets/Header';
import { SmartSearchOverlay } from '@/shared/ui/SmartSearchOverlay';
import { buildHeaderTabs } from '@/shared/lib/headerTabs';

// 개인정보처리방침/이용약관/회사소개/문의처럼 footer에서만 진입하는 순수 텍스트
// 페이지 공용 셸(2026-08-07) — Header/검색 오버레이 배선을 4번 반복하지 않는다.
interface Props {
  title: string;
  updated?: string;
  children: React.ReactNode;
}

export function StaticPageShell({ title, updated, children }: Props) {
  const [showSearch, setShowSearch] = useState(false);

  return (
    <div className="min-h-screen bg-white">
      <Header onSearch={() => setShowSearch(true)} tabs={buildHeaderTabs()} frosted />
      <SmartSearchOverlay open={showSearch} onClose={() => setShowSearch(false)} />

      <main style={{ maxWidth: 720, margin: '0 auto', padding: 'clamp(28px, 5vw, 56px) clamp(20px, 5vw, 32px) 96px' }}>
        <header style={{ marginBottom: 32 }}>
          <h1
            className="font-medium text-gray-900"
            style={{ fontFamily: '"Noto Serif KR", serif', fontSize: 'clamp(24px, 4.5vw, 30px)', letterSpacing: '-0.02em' }}
          >
            {title}
          </h1>
          {updated && (
            <p style={{ fontSize: 12, color: '#9ca3af', marginTop: 10 }}>최종 수정일: {updated}</p>
          )}
        </header>

        <div style={{ fontSize: 14.5, lineHeight: 1.9, color: '#374151' }}>{children}</div>
      </main>
    </div>
  );
}
