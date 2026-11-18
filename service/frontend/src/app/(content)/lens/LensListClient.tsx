'use client';

import { useEffect, useState } from 'react';
import { Header } from '@/widgets/Header';
import { SearchOverlay } from '@/shared/ui/search/SearchOverlay';
import { HomeSideBar } from '@/widgets/HomeSideBar';
import { ArchiveList } from '@/shared/ui/list/ArchiveList';
import { CategoryCards, CategoryLead } from '@/shared/ui/list/CategoryLead';
import { buildHeaderTabs } from '@/shared/lib/headerTabs';
import { Pager } from '@/shared/ui/list/Pager';
import { fetchLensPosts } from '@/shared/lib/api/cmsPostsApi';
import type { TodayLetterCardLike } from '@/shared/lib/api/todayLettersApi';
import { buildLensListView, type LensListView } from './lensListShared';

// "최신 뉴스" 목록(/lens, 홈의 "최신 뉴스 · 전체 보기"와 이름을 맞춤) — 카테고리 페이지(/markets 등)와 같은 구조이다.
//   [‹ 오늘의 시선 헤더] → [히어로 1건] → [카드 3건] → [날짜별 목록 | 우측 레일]
// 홈의 지면 영역·기사 상세가 네 형식을 이미 보여 주므로 목록에서는 형식별 요소를 반복하지 않는다. 페이지 주소(/lens, /lens/page/N)와 서버 페이지네이션을 사용한다.
// 서버는 화면에 그릴 조각(initialView)만 넘기고, 마운트 후 최신 목록을 다시 받아 같은 함수로 다시 계산한다(캐시된 HTML보다 새 글이 있으면 반영).
export function LensListClient({
  initialView,
  initialPage,
  initialHotLetters,
}: {
  initialView: LensListView;
  initialPage: number;
  initialHotLetters?: TodayLetterCardLike[];
}) {
  const [showSearch, setShowSearch] = useState(false);
  const [view, setView] = useState<LensListView>(initialView);

  useEffect(() => {
    let cancelled = false;
    fetchLensPosts().then((rows) => {
      if (!cancelled && rows.length > 0) setView(buildLensListView(rows, initialPage));
    });
    return () => {
      cancelled = true;
    };
  }, [initialPage]);

  const { featured, pageItems, railItems, currentPage, totalPages } = view;
  const pageHref = (n: number) => (n <= 1 ? '/lens' : `/lens/page/${n}`);
  const firstPage = currentPage === 1;

  return (
    <div className="min-h-screen bg-white">
      <Header searchOpen={showSearch} onSearch={() => setShowSearch((open) => !open)} tabs={buildHeaderTabs()} frosted />
      <SearchOverlay open={showSearch} onClose={() => setShowSearch(false)} />

      <div className="mx-auto" style={{ maxWidth: 1320, padding: 'clamp(8px, 2vw, 16px) clamp(24px, 3.5vw, 44px) 0' }}>
        <h1 className="sr-only">최신 뉴스 — 하나의 이슈, 네 가지 형식으로 읽는 AI LENS</h1>

        {firstPage && featured.length >= 1 && <CategoryLead lead={featured[0]} showCategory />}

        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_300px]" style={{ columnGap: 40, paddingTop: 24 }}>
          <main style={{ padding: '0 0 80px' }}>
            {firstPage && featured.length >= 4 && <CategoryCards items={featured.slice(1, 4)} showCategory />}
            <ArchiveList items={pageItems} showCategory emptyLabel="아직 올라온 이슈가 없어요." />

            <Pager currentPage={currentPage} totalPages={totalPages} hrefFor={pageHref} />
          </main>

          <HomeSideBar className="hidden lg:block" initialHotLetters={initialHotLetters} railHeading="최신 글" railItems={railItems} />
        </div>
      </div>
    </div>
  );
}
