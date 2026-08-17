'use client';

import { useState } from 'react';
import { Header } from '@/widgets/Header';
import { SmartSearchOverlay } from '@/shared/ui/SmartSearchOverlay';
import { buildHeaderTabs } from '@/shared/lib/headerTabs';
import { TimelineResultView, TimelineTopicsView, type Article, type BigKindsTopic } from '@/features/timeline';

type Props =
  | { date: string; initialArticles: Article[]; initialTopics?: undefined }
  | { date: string; initialArticles?: undefined; initialTopics: BigKindsTopic[] };

export function TimelineDayClient({ date, initialArticles, initialTopics }: Props) {
  const [showSearch, setShowSearch] = useState(false);

  return (
    <div className="min-h-screen bg-white">
      <Header onSearch={() => setShowSearch(true)} tabs={buildHeaderTabs('timeline')} frosted />
      <SmartSearchOverlay open={showSearch} onClose={() => setShowSearch(false)} />
      {initialTopics ? (
        <TimelineTopicsView date={date} topics={initialTopics} />
      ) : (
        <TimelineResultView date={date} initialArticles={initialArticles} />
      )}
    </div>
  );
}
