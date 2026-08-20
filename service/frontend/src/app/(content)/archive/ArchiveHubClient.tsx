'use client';

import { useEffect, useState } from 'react';
import { Header } from '@/widgets/Header';
import { SmartSearchOverlay } from '@/shared/ui/SmartSearchOverlay';
import { ArchiveHeader } from '@/shared/ui/ArchiveHeader';
import { ArchiveList } from '@/shared/ui/ArchiveList';
import { buildHeaderTabs } from '@/shared/lib/headerTabs';
import { fetchCmsPosts, fetchTrendCards, fetchVideos } from '@/shared/lib/api/cmsPostsApi';
import { buildArchiveItems, PAGE_SIZE, type ArchiveItem } from '@/shared/lib/archiveItems';

export function ArchiveHubClient({ initialItems }: { initialItems: ArchiveItem[] }) {
  const [showSearch, setShowSearch] = useState(false);
  const [items, setItems] = useState<ArchiveItem[]>(initialItems);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetchCmsPosts('letters', undefined, PAGE_SIZE),
      fetchTrendCards(),
      fetchVideos(),
    ]).then(([letters, cards, videos]) => {
      if (cancelled) return;
      const all = buildArchiveItems(letters, cards, videos);
      if (all.length > 0) setItems(all);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-white">
      {/* 'feed' 탭은 2026-08-17 상단 탭 개편으로 nav에서 빠졌다(headerTabs.ts
          참조) — 이 페이지 자체는 남아있지만 강조할 대응 탭이 더 없다. */}
      <Header onSearch={() => setShowSearch(true)} tabs={buildHeaderTabs()} frosted />
      <SmartSearchOverlay open={showSearch} onClose={() => setShowSearch(false)} />

      <main style={{ maxWidth: 720, margin: '0 auto', padding: 'clamp(28px, 5vw, 56px) clamp(20px, 5vw, 32px) 80px' }}>
        <ArchiveHeader
          kicker="Archive"
          title="지금까지의 모든 콘텐츠"
          accentColor="#111827"
          description="증시·부동산·산업·금융/정책·국제·재테크 뉴스와 영상을 한 곳에서 모아봅니다."
        />
        <p style={{ fontSize: 12.5, color: '#9ca3af', marginBottom: 14 }}>총 {items.length}개</p>
        <ArchiveList items={items} />
      </main>
    </div>
  );
}
