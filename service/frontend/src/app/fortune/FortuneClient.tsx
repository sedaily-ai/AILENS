'use client';

import { useState, Suspense } from 'react';
import { Header } from "@/widgets/Header";
import Link from 'next/link';
import { FortuneTab } from '@/features/fortune';
import { FortuneBackdrop } from '@/features/fortune/components/FortuneBackdrop';
import { SmartSearchOverlay } from '@/components/mbti/SmartSearchOverlay';
import { UserMenu } from '@/features/auth';
import type { MbtiGroupId } from '@/shared/data/mbtiGroups';
import { useMbtiGroup } from '@/shared/hooks/useMbtiGroup';
import { buildHeaderTabs } from '@/shared/lib/headerTabs';

export function FortuneClient() {
  const [selectedGroup, setSelectedGroup] = useMbtiGroup('NF');
  const [showSearch, setShowSearch] = useState(false);

  const handleMbtiChange = (g: MbtiGroupId) => {
    setSelectedGroup(g);
  };

  return (
    <div className="min-h-screen flex flex-col relative">
      <FortuneBackdrop group={selectedGroup} />

      {/* 글로벌 헤더 — 다른 페이지와 동일 */}
      <Header
        onSearch={() => setShowSearch(true)}
        tabs={buildHeaderTabs('fortune')}
        frosted
      />

      <SmartSearchOverlay open={showSearch} onClose={() => setShowSearch(false)} selectedGroup={selectedGroup} />

      <main className="flex-1 relative" style={{ zIndex: 1 }}>
        {/* useSearchParams 사용 — 정적 export 빌드에서 Suspense 경계 필수 */}
        <Suspense fallback={<div className="min-h-screen" />}>
          <FortuneTab selectedGroup={selectedGroup} onMbtiChange={handleMbtiChange} />
        </Suspense>
      </main>
    </div>
  );
}
