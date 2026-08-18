'use client';

import { useEffect, useState } from 'react';
import { Header } from '@/widgets/Header';
import { SmartSearchOverlay } from '@/shared/ui/SmartSearchOverlay';
import { ArchiveHeader } from '@/shared/ui/ArchiveHeader';
import { ArchiveList } from '@/shared/ui/ArchiveList';
import { buildHeaderTabs } from '@/shared/lib/headerTabs';
import { fetchCmsPosts } from '@/shared/lib/api/cmsPostsApi';
import { buildArchiveItems, PAGE_SIZE, ISSUE_TALK_ACCENT, type ArchiveItem } from '@/shared/lib/archiveItems';

export function IssueTalkListClient({ initialItems }: { initialItems: ArchiveItem[] }) {
  const [showSearch, setShowSearch] = useState(false);
  const [items, setItems] = useState<ArchiveItem[]>(initialItems);

  useEffect(() => {
    let cancelled = false;
    // "이슈 톡톡"은 letters 채널의 분류(section="issue_talk")다 — trend/column과
    // 같은 패턴(ColumnListClient.tsx 참조).
    fetchCmsPosts('letters', undefined, PAGE_SIZE).then((letters) => {
      if (cancelled) return;
      const all = buildArchiveItems(letters, [], []).filter((it) => it.kind === 'issue_talk');
      if (all.length > 0) setItems(all);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen bg-white">
      <Header onSearch={() => setShowSearch(true)} tabs={buildHeaderTabs()} frosted />
      <SmartSearchOverlay open={showSearch} onClose={() => setShowSearch(false)} />

      <main style={{ maxWidth: 720, margin: '0 auto', padding: 'clamp(28px, 5vw, 56px) clamp(20px, 5vw, 32px) 80px' }}>
        <ArchiveHeader
          kicker="Issue Talk"
          title="이슈 톡톡 — 실명 에디터가 짚는 오늘"
          titleAccent="이슈 톡톡"
          accentColor={ISSUE_TALK_ACCENT}
          description="AI LENS 에디터가 이름을 걸고 직접 짚어드리는 오늘의 이슈."
        />
        <p style={{ fontSize: 12.5, color: '#9ca3af', marginBottom: 14 }}>총 {items.length}개</p>
        <ArchiveList items={items} emptyLabel="아직 이슈 톡톡이 없어요." />
      </main>
    </div>
  );
}
