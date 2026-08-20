'use client';

// 경제 버티컬 카테고리(증시/부동산/산업/금융·정책/국제/재테크) 아카이브 —
// ColumnListClient.tsx와 같은 패턴(Header+ArchiveHeader+ArchiveList)을
// 재사용하되, 카테고리 6개가 페이지 구조는 완전히 동일하고 설정값만
// 다르므로 하나의 클라이언트 컴포넌트로 공유한다(2026-08-17). "kind"(형식:
// 브리핑/인사이트) 축과 무관하게 "category"(주제) 하나로만 필터링 — 상단
// 탭이 형식 기반에서 주제 기반으로 바뀌면서, 이슈 톡톡이든 인사이트든
// 같은 주제면 한 페이지에 같이 모인다.
import { useEffect, useState } from 'react';
import { Header } from '@/widgets/Header';
import { SmartSearchOverlay } from '@/shared/ui/SmartSearchOverlay';
import { ArchiveHeader } from '@/shared/ui/ArchiveHeader';
import { ArchiveList } from '@/shared/ui/ArchiveList';
import { buildHeaderTabs, type HeaderTabKey } from '@/shared/lib/headerTabs';
import { fetchCmsPosts, fetchLensPosts } from '@/shared/lib/api/cmsPostsApi';
import { buildArchiveItems, PAGE_SIZE, type ArchiveItem } from '@/shared/lib/archiveItems';
import type { EconCategoryConfig } from '@/shared/constants/econCategories';

export function CategoryArchiveClient({
  config,
  tabKey,
  initialItems,
}: {
  config: EconCategoryConfig;
  tabKey: HeaderTabKey;
  initialItems: ArchiveItem[];
}) {
  const [showSearch, setShowSearch] = useState(false);
  const [items, setItems] = useState<ArchiveItem[]>(initialItems);

  useEffect(() => {
    let cancelled = false;
    Promise.all([fetchCmsPosts('letters', undefined, PAGE_SIZE), fetchLensPosts()]).then(
      ([letters, lens]) => {
        if (cancelled) return;
        const all = buildArchiveItems(letters, [], [], lens).filter(
          (it) => it.category === config.label,
        );
        if (all.length > 0) setItems(all);
      },
    );
    return () => {
      cancelled = true;
    };
  }, [config.label]);

  return (
    <div className="min-h-screen bg-white">
      <Header onSearch={() => setShowSearch(true)} tabs={buildHeaderTabs(tabKey)} frosted />
      <SmartSearchOverlay open={showSearch} onClose={() => setShowSearch(false)} />

      <main style={{ maxWidth: 720, margin: '0 auto', padding: 'clamp(28px, 5vw, 56px) clamp(20px, 5vw, 32px) 80px' }}>
        <ArchiveHeader
          kicker={config.slug.toUpperCase()}
          title={`${config.label} — 오늘의 이슈`}
          titleAccent={config.label}
          accentColor={config.accent}
          description={config.description}
        />
        <p style={{ fontSize: 12.5, color: '#9ca3af', marginBottom: 14 }}>총 {items.length}개</p>
        <ArchiveList items={items} emptyLabel={`아직 ${config.label} 글이 없어요.`} />
      </main>
    </div>
  );
}
