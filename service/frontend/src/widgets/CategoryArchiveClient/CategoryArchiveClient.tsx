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
import { HomeSideBar } from '@/widgets/HomeSideBar';
import { buildHeaderTabs, type HeaderTabKey } from '@/shared/lib/headerTabs';
import { fetchCmsPosts, fetchLensPosts } from '@/shared/lib/api/cmsPostsApi';
import { buildArchiveItems, PAGE_SIZE, type ArchiveItem } from '@/shared/lib/archiveItems';
import type { EconCategoryConfig } from '@/shared/constants/econCategories';
import type { TodayLetterCardLike } from '@/shared/lib/api/todayLettersApi';

export function CategoryArchiveClient({
  config,
  tabKey,
  initialItems,
  initialHotLetters,
}: {
  config: EconCategoryConfig;
  tabKey: HeaderTabKey;
  initialItems: ArchiveItem[];
  // 홈(app/page.tsx)과 같은 서버 프리페치 패턴(2026-08-23) — 없으면
  // HotLettersRail이 클라이언트 fetch 완료 전까지 아무것도 안 그려서
  // "인기글 섹션이 통째로 없어진 것처럼" 보인다(사용자 지적: "그런건
  // 어디감?"). 첫 페인트부터 채워서 홈과 동일하게 즉시 보이게 한다.
  initialHotLetters?: TodayLetterCardLike[];
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

      {/* 우측 사이드바(HomeSideBar — 인기글+사주) 추가(2026-08-23, 사용자
          요청: "전체 보기나 카테고리 탭 눌렀을 때도 메인페이지랑 동일하게
          나오도록"). 홈(NewsFeedTab.tsx)·lens 상세(LensViewClient.tsx)와
          같은 maxWidth 1320 + 2열 그리드 패턴을 그대로 맞춘다 — lg 미만은
          사이드바 없이 기존 그대로.
          본문 <main>에 있던 maxWidth:720을 뺐다 — 그리드 안에서 본문 칼럼
          (~976px)보다 좁게 잡아두니 사이드바 왼쪽에 빈 공간이 크게 남아
          "여백이 많아졌다"고 보였다(사용자 지적). 홈도 본문 칼럼을 따로
          좁히지 않고 grid 1fr 칼럼 폭을 그대로 쓴다 — 그 밸런스에 맞춘다.
          바깥 wrapper의 top padding도 홈(NewsFeedTab.tsx)의
          clamp(8px,2vw,16px)와 맞추고, 사이드바 자체엔 paddingTop을 더
          안 준다 — ArchiveHeader가 자기 안에서 28~56px 여백을 따로 갖는
          바람에 사이드바까지 그만큼 밀어내려 홈보다 훨씬 아래서 시작하는
          것처럼 보였다(사용자 지적: "탭 페이지가 더 아래로 내려가있고").
          사이드바는 그리드 맨 위에 그대로 둬서 Y 시작선을 홈과 맞춘다.
          좌우 패딩도 clamp(24px,3.5vw,44px)로 — 처음엔 lens 상세 페이지
          (LensViewClient.tsx)의 clamp(20px,4vw,28px)를 그대로 가져왔는데
          그건 홈(NewsFeedTab.tsx) 값과 달라서 사이드바가 홈보다 오른쪽으로
          밀려 보였다(사용자 지적: "우측 사이드 쪽이 오른쪽으로 밀리는
          느낌"). 비교 기준이 홈이므로 홈 값에 맞춘다. */}
      <div className="mx-auto" style={{ maxWidth: 1320, padding: 'clamp(8px, 2vw, 16px) clamp(24px, 3.5vw, 44px) 0' }}>
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_280px]" style={{ columnGap: 64 }}>
          <main style={{ padding: '0 0 80px' }}>
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

          <HomeSideBar className="hidden lg:block" initialHotLetters={initialHotLetters} />
        </div>
      </div>
    </div>
  );
}
