'use client';

import { useState } from 'react';
import { Header } from '@/widgets/Header';
import { SmartSearchOverlay } from '@/shared/ui/SmartSearchOverlay';
import { buildHeaderTabs } from '@/shared/lib/headerTabs';
import { TimelineResultView, type Article, type Source } from '@/features/timeline';

export function TimelineDayClient({
  date,
  initialArticles,
  initialSource,
  initialDegraded,
}: {
  date: string;
  initialArticles: Article[];
  initialSource: Source;
  initialDegraded?: string;
}) {
  const [showSearch, setShowSearch] = useState(false);

  return (
    <div className="min-h-screen bg-white">
      <Header onSearch={() => setShowSearch(true)} tabs={buildHeaderTabs('timeline')} frosted />
      <SmartSearchOverlay open={showSearch} onClose={() => setShowSearch(false)} />
      <TimelineResultView
        date={date}
        initialArticles={initialArticles}
        initialSource={initialSource}
        initialDegraded={initialDegraded}
      />
    </div>
  );
}
