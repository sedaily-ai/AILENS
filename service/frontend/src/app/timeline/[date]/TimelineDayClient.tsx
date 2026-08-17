'use client';

import { useState } from 'react';
import { Header } from '@/widgets/Header';
import { SmartSearchOverlay } from '@/shared/ui/SmartSearchOverlay';
import { buildHeaderTabs } from '@/shared/lib/headerTabs';
import { TimelineResultView, TimelineBigkindsView, type Article, type BigKindsArticle, type InvestmentScenario } from '@/features/timeline';

type Props =
  | { date: string; initialArticles: Article[]; initialBigkindsArticles?: undefined; initialInvestments?: undefined }
  | { date: string; initialArticles?: undefined; initialBigkindsArticles: BigKindsArticle[]; initialInvestments: InvestmentScenario[] };

export function TimelineDayClient({ date, initialArticles, initialBigkindsArticles, initialInvestments }: Props) {
  const [showSearch, setShowSearch] = useState(false);

  return (
    <div className="min-h-screen bg-white">
      <Header onSearch={() => setShowSearch(true)} tabs={buildHeaderTabs('timeline')} frosted />
      <SmartSearchOverlay open={showSearch} onClose={() => setShowSearch(false)} />
      {initialBigkindsArticles ? (
        <TimelineBigkindsView date={date} articles={initialBigkindsArticles} investments={initialInvestments} />
      ) : (
        <TimelineResultView date={date} initialArticles={initialArticles} />
      )}
    </div>
  );
}
