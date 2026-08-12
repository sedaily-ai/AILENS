'use client';

import { useEffect, useState } from 'react';
import { Header } from '@/widgets/Header';
import { SmartSearchOverlay } from '@/shared/ui/SmartSearchOverlay';
import { ArchiveHeader } from '@/shared/ui/ArchiveHeader';
import { ArchiveList } from '@/shared/ui/ArchiveList';
import { buildHeaderTabs } from '@/shared/lib/headerTabs';
import { fetchCmsPosts, fetchTrendCards } from '@/shared/lib/cmsPostsApi';
import { buildArchiveItems, PAGE_SIZE, COLUMN_ACCENT, type ArchiveItem } from '@/shared/lib/archiveItems';

export function ColumnListClient({ initialItems }: { initialItems: ArchiveItem[] }) {
  const [showSearch, setShowSearch] = useState(false);
  const [items, setItems] = useState<ArchiveItem[]>(initialItems);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchCmsPosts('letters', undefined, PAGE_SIZE), fetchTrendCards()]).then(([letters, cards]) => {
      if (cancelled) return;
      const all = buildArchiveItems(letters, cards, []).filter((it) => it.kind === 'column');
      if (all.length > 0) setItems(all);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-white">
      <Header onSearch={() => setShowSearch(true)} tabs={buildHeaderTabs('column')} frosted />
      <SmartSearchOverlay open={showSearch} onClose={() => setShowSearch(false)} />

      <main style={{ maxWidth: 720, margin: '0 auto', padding: 'clamp(28px, 5vw, 56px) clamp(20px, 5vw, 32px) 80px' }}>
        <ArchiveHeader
          kicker="Insight"
          title="인사이트 — 관점 있는 시선"
          titleAccent="인사이트"
          accentColor={COLUMN_ACCENT}
          description="이번 주 눈여겨볼 경제 이슈를 관점 있는 시선으로 짚어봅니다."
        />
        <p style={{ fontSize: 12.5, color: '#9ca3af', marginBottom: 14 }}>총 {items.length}개</p>
        <ArchiveList items={items} emptyLabel="아직 인사이트가 없어요." />
      </main>
    </div>
  );
}
