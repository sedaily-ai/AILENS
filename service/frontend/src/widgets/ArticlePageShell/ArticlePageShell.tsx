'use client';

import { useState } from 'react';
import { Header } from '@/widgets/Header';
import { SmartSearchOverlay } from '@/shared/ui/SmartSearchOverlay';
import { buildHeaderTabs } from '@/shared/lib/headerTabs';

// Header/검색 오버레이 배선 + "요즘 많이 읽힌 글" 사이드바 그리드를 4번
// 반복하지 않는다(widgets/StaticPageShell와 같은 이유 — 그쪽은 법적
// 페이지용, 이건 사이드바 있는 기사형 페이지용).
//
// 2026-09-03(ISR 재설계 감사 후속) — LensViewClient·LensListClient·
// LetterDetailClient·NewsFeedTab 4곳이 이 배선을 완전히 동일하게(글자
// 하나 안 틀리고) 복제하고 있었다. 2026-08-18과 2026-08-23 두 번 다 헤더/
// 사이드바 불일치가 나서 수동으로 맞췄고, 그때마다 worklog에 "다음엔
// 공용 컴포넌트로 추출" 이라고 남겼는데 실제로는 안 했다 — 이번에 한다.
//
// video/listen/webtoon 6개 페이지는 여기 포함 안 됨 — 이미 다른 모양
// (단일 컬럼, webtoon은 다크테마+커스텀 바)으로 발산해 있어서 억지로
// 통합하면 leaky해진다는 게 조사로 확인됨(전체조사 참조) — 그쪽은
// 그대로 둔다.
interface Props {
  // 없으면 사이드바 없는 단일 컬럼(전체 너비)으로 렌더 — children이 자체
  // maxWidth를 갖고 있어야 한다(예: LensViewClient의 .lw 클래스).
  sidebar?: React.ReactNode;
  // 그리드(본문+사이드바) 아래, maxWidth 1320 바깥의 전체 폭 영역 —
  // LetterDetailClient의 "다른 레터" 섹션처럼 사이드바 유무와 무관하게
  // 화면 전체 폭을 쓰는 내용용. 없으면 렌더 안 함.
  afterContent?: React.ReactNode;
  children: React.ReactNode;
}

export function ArticlePageShell({ sidebar, afterContent, children }: Props) {
  const [showSearch, setShowSearch] = useState(false);

  return (
    // overflow-x: clip — 상세 히어로가 100vw 풀블리드로 읽기 컬럼을 벗어나는데, 세로 스크롤바가 있는 환경에서
    // 100vw가 화면보다 넓어 생기는 가로 스크롤을 막는다(clip은 sticky를 깨지 않는다).
    <div className="min-h-screen bg-white" style={{ overflowX: 'clip' }}>
      <Header onSearch={() => setShowSearch(true)} tabs={buildHeaderTabs()} />
      <SmartSearchOverlay open={showSearch} onClose={() => setShowSearch(false)} />

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
