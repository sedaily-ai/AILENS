'use client';

import { useState, useEffect } from 'react';
import { Header } from "@/widgets/Header";
import Link from 'next/link';
import { NewsTimeMachine } from '@/components/timeline/NewsTimeMachine';
import { SmartSearchOverlay } from '@/components/mbti/SmartSearchOverlay';
import { UserMenu } from '@/features/auth';
import { useMbtiGroup } from '@/shared/hooks/useMbtiGroup';
import { buildHeaderTabs } from '@/shared/lib/headerTabs';

export default function TimelinePage() {
  const [userGroup] = useMbtiGroup('SF');
  const [showSearch, setShowSearch] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- 마운트 시 1회 ready 플래그
    setReady(true);
  }, []);


  if (!ready) {
    return <div className="min-h-screen bg-white" />;
  }

  return (
    <div className="min-h-screen bg-white">
      {/* 글로벌 헤더 — 다른 페이지와 동일 */}
      <Header
        onSearch={() => setShowSearch(true)}
        tabs={buildHeaderTabs('timeline')}
        frosted
      />

      <SmartSearchOverlay open={showSearch} onClose={() => setShowSearch(false)} selectedGroup={userGroup} />

      <main>
        <NewsTimeMachine userGroup={userGroup} />
      </main>
    </div>
  );
}
