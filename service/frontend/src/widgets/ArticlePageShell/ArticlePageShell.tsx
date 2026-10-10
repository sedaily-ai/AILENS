'use client';

import { useState } from 'react';
import { Header } from '@/widgets/Header';
import { SearchOverlay } from '@/shared/ui/search/SearchOverlay';
import { buildHeaderTabs, type HeaderTabKey } from '@/shared/lib/headerTabs';

// Header/검색 오버레이 배선 + "요즘 많이 읽힌 글" 사이드바 그리드를 페이지마다 반복하지 않는다
// (widgets/StaticPageShell과 같은 이유이며, 이쪽은 사이드바 있는 기사형 페이지용이다).
// LensViewClient·LensListClient·LetterDetailClient·NewsFeedTab이 공유한다. video/listen/webtoon 페이지는 이미 다른 모양
// (단일 컬럼, webtoon은 다크테마+커스텀 바)이라 억지로 통합하지 않는다.
interface Props {
  // 없으면 사이드바 없는 단일 컬럼(전체 너비)으로 렌더한다. 이 경우 children이 자체 maxWidth를 가져야 한다(예: LensViewClient의 .lw 클래스).
  sidebar?: React.ReactNode;
  // 그리드(본문+사이드바) 아래, maxWidth 1320 바깥의 전체 폭 영역 —
  // LetterDetailClient의 "다른 레터" 섹션처럼 사이드바 유무와 무관하게
  // 화면 전체 폭을 쓰는 내용용. 없으면 렌더 안 함.
  afterContent?: React.ReactNode;
  // 헤더에서 활성으로 표시할 탭(레터 탭 등 자체 라우트 페이지용). 없으면 활성 탭 없음.
  activeTab?: HeaderTabKey;
  children: React.ReactNode;
}

export function ArticlePageShell({ sidebar, afterContent, activeTab, children }: Props) {
  const [showSearch, setShowSearch] = useState(false);

  return (
    <div className="min-h-screen bg-white">
      <Header onSearch={() => setShowSearch(true)} tabs={buildHeaderTabs(activeTab)} />
      <SearchOverlay open={showSearch} onClose={() => setShowSearch(false)} />

      <div className="mx-auto" style={{ maxWidth: 1320, padding: 'clamp(8px, 2vw, 16px) clamp(24px, 3.5vw, 44px) 0' }}>
        {sidebar ? (
          <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_280px]" style={{ columnGap: 64 }}>
            <div style={{ minWidth: 0 }}>{children}</div>
            {sidebar}
          </div>
        ) : (
          children
        )}
      </div>

      {afterContent}
    </div>
  );
}
