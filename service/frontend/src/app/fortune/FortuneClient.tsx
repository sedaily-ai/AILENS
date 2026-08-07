'use client';

import { useState, Suspense } from 'react';
import { Header } from "@/widgets/Header";
import Link from 'next/link';
import { FortuneTab } from '@/features/fortune';
import { FortuneBackdrop } from '@/features/fortune/components/FortuneBackdrop';
import { SmartSearchOverlay } from '@/components/mbti/SmartSearchOverlay';
import { UserMenu } from '@/features/auth';
import { buildHeaderTabs } from '@/shared/lib/headerTabs';

// MBTI 페르소나 개념 폐기(2026-08-07) 이후로는 이 페이지가 전역 "내 그룹" 선택을
// 들고 다니지 않는다 — FortuneTab/FortuneBackdrop 은 각자 자체 기본값(둘 다 'NF')을
// 쓰는 optional prop 이라 아예 넘기지 않아도 된다 (features/fortune 은 사주 전용
// 스타일링이라 이 파일 범위 밖, personaVoice.ts 도 마찬가지로 무관한 개념).
export function FortuneClient() {
  const [showSearch, setShowSearch] = useState(false);

  return (
    <div className="min-h-screen flex flex-col relative">
      <FortuneBackdrop />

      {/* 글로벌 헤더 — 다른 페이지와 동일 */}
      <Header
        onSearch={() => setShowSearch(true)}
        tabs={buildHeaderTabs('fortune')}
        frosted
      />

      <SmartSearchOverlay open={showSearch} onClose={() => setShowSearch(false)} />

      <main className="flex-1 relative" style={{ zIndex: 1 }}>
        {/* useSearchParams 사용 — 정적 export 빌드에서 Suspense 경계 필수 */}
        <Suspense fallback={<div className="min-h-screen" />}>
          <FortuneTab />
        </Suspense>
      </main>
    </div>
  );
}
