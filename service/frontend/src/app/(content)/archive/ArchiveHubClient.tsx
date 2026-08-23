'use client';

import { useEffect, useState } from 'react';
import { Header } from '@/widgets/Header';
import { SmartSearchOverlay } from '@/shared/ui/SmartSearchOverlay';
import { ArchiveHeader } from '@/shared/ui/ArchiveHeader';
import { ArchiveList } from '@/shared/ui/ArchiveList';
import { HomeSideBar } from '@/shared/ui/HomeSideBar';
import { buildHeaderTabs } from '@/shared/lib/headerTabs';
import { fetchCmsPosts, fetchTrendCards, fetchVideos, fetchLensPosts } from '@/shared/lib/api/cmsPostsApi';
import { buildArchiveItems, PAGE_SIZE, type ArchiveItem } from '@/shared/lib/archiveItems';
import type { TodayLetterCardLike } from '@/shared/lib/api/todayLettersApi';

export function ArchiveHubClient({
  initialItems,
  initialHotLetters,
}: {
  initialItems: ArchiveItem[];
  // 홈/카테고리 페이지와 같은 서버 프리페치 패턴(2026-08-23) — 없으면
  // HotLettersRail이 클라이언트 fetch 완료 전까지 섹션 자체가 안 보인다.
  initialHotLetters?: TodayLetterCardLike[];
}) {
  const [showSearch, setShowSearch] = useState(false);
  const [items, setItems] = useState<ArchiveItem[]>(initialItems);

  useEffect(() => {
    let cancelled = false;
    // lens도 같이 불러온다(2026-08-23, 사용자 지적 — "여기에 lens도
    // 있어야 하는데"). page.tsx의 서버 프리페치와 짝 — 클라이언트
    // 갱신에서도 빠지면 첫 페인트 이후 최신 lens 글이 안 보인다.
    Promise.all([
      fetchCmsPosts('letters', undefined, PAGE_SIZE),
      fetchTrendCards(),
      fetchVideos(),
      fetchLensPosts(),
    ]).then(([letters, cards, videos, lens]) => {
      if (cancelled) return;
      const all = buildArchiveItems(letters, cards, videos, lens);
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

      {/* 우측 사이드바(HomeSideBar) 추가(2026-08-23, 사용자 요청 — 홈·카테고리
          페이지와 동일하게). CategoryArchiveClient.tsx와 완전히 같은 패턴
          (maxWidth 1320 + 2열 grid, 좌우 패딩 clamp(24px,3.5vw,44px) —
          홈=NewsFeedTab.tsx 기준, 본문 maxWidth 캡 없음, 사이드바
          paddingTop 없음)을 그대로 옮겨왔다. */}
      <div className="mx-auto" style={{ maxWidth: 1320, padding: 'clamp(8px, 2vw, 16px) clamp(24px, 3.5vw, 44px) 0' }}>
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_280px]" style={{ columnGap: 64 }}>
          <main style={{ padding: '0 0 80px' }}>
            <ArchiveHeader
              kicker="Archive"
              title="지금까지의 모든 콘텐츠"
              accentColor="#111827"
              description="증시·부동산·산업·금융/정책·국제·재테크 뉴스와 영상을 한 곳에서 모아봅니다."
            />
            <p style={{ fontSize: 12.5, color: '#9ca3af', marginBottom: 14 }}>총 {items.length}개</p>
            <ArchiveList items={items} />
          </main>

          <HomeSideBar className="hidden lg:block" initialHotLetters={initialHotLetters} />
        </div>
      </div>
    </div>
  );
}
