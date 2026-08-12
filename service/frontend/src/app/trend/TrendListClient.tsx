'use client';

import { useEffect, useState } from 'react';
import { Header } from '@/widgets/Header';
import { SmartSearchOverlay } from '@/shared/ui/SmartSearchOverlay';
import { ArchiveHeader } from '@/shared/ui/ArchiveHeader';
import { ArchiveList } from '@/shared/ui/ArchiveList';
import { buildHeaderTabs } from '@/shared/lib/headerTabs';
import { fetchCmsPosts, fetchTrendCards } from '@/shared/lib/cmsPostsApi';
import { buildArchiveItems, PAGE_SIZE, TREND_ACCENT, type ArchiveItem } from '@/shared/lib/archiveItems';

export function TrendListClient({ initialItems }: { initialItems: ArchiveItem[] }) {
  const [showSearch, setShowSearch] = useState(false);
  const [items, setItems] = useState<ArchiveItem[]>(initialItems);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchCmsPosts('letters', undefined, PAGE_SIZE), fetchTrendCards()]).then(([letters, cards]) => {
      if (cancelled) return;
      const all = buildArchiveItems(letters, cards, []).filter((it) => it.kind === 'trend');
      if (all.length > 0) setItems(all);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-white">
      <Header onSearch={() => setShowSearch(true)} tabs={buildHeaderTabs('trend')} frosted />
      <SmartSearchOverlay open={showSearch} onClose={() => setShowSearch(false)} />

      <main style={{ maxWidth: 720, margin: '0 auto', padding: 'clamp(28px, 5vw, 56px) clamp(20px, 5vw, 32px) 80px' }}>
        <ArchiveHeader
          kicker="Deep Dive"
          title="딥다이브 — 같은 사실, 네 가지 관점"
          titleAccent="딥다이브"
          accentColor={TREND_ACCENT}
          description="요즘 화제인 경제 이슈를 사실 하나로, 관점은 여러 개로 짚어봅니다."
        />
        <p style={{ fontSize: 12.5, color: '#9ca3af', marginBottom: 14 }}>총 {items.length}개</p>
        <ArchiveList items={items} emptyLabel="아직 딥다이브 이슈가 없어요." />
      </main>
    </div>
  );
}
