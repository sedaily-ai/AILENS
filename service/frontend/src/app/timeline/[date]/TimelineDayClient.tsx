'use client';

import { useState } from 'react';
import { Header } from '@/widgets/Header';
import { SmartSearchOverlay } from '@/shared/ui/SmartSearchOverlay';
import { buildHeaderTabs } from '@/shared/lib/headerTabs';
import { TimelineResultView, type Article } from '@/features/timeline';

export function TimelineDayClient({
  date,
  initialArticles,
}: {
  date: string;
  initialArticles: Article[];
}) {
  const [showSearch, setShowSearch] = useState(false);

  return (
    <div className="min-h-screen bg-white">
      <Header onSearch={() => setShowSearch(true)} tabs={buildHeaderTabs('timeline')} frosted />
      <SmartSearchOverlay open={showSearch} onClose={() => setShowSearch(false)} />
      <TimelineResultView date={date} initialArticles={initialArticles} />
    </div>
  );
}
