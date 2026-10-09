'use client';

import type { MbtiGroupId } from "@/shared/data/mbtiGroups";
import type { CmsVideo, CmsWebtoon, CmsLens } from "@/shared/lib/api/cmsPostsApi";
import type { ArchiveItem } from "@/shared/lib/content/archiveItems";
import type { HomePlayerPost } from "@/shared/lib/api/homePlayerApi";
import { WebtoonPreviewSection } from "./sections/WebtoonPreviewSection";
import { VideoPreviewSection } from "./sections/VideoPreviewSection";
import { GamesPreviewSection } from "./sections/GamesPreviewSection";
import { AudioPreviewSection } from "./sections/AudioPreviewSection";
import { LensPreviewSection } from "./sections/LensPreviewSection";
import { NewsTimeMachineSection } from "./sections/NewsTimeMachineSection";
import { LatestGridSection } from "./sections/LatestGridSection";
import { CategoryFeatureSection } from "./sections/CategoryFeatureSection";
import type { ReactNode } from "react";
import { categoryMatches, ECON_CATEGORIES } from "@/shared/constants/econCategories";

// 카테고리를 2개씩 짝지어 한 줄(2/3+1/3)로 배치한다. 순서는 ECON_CATEGORIES 정의 순서를 따른다.
// 짝이 없는 카테고리(문화)는 마지막에 단독(1개짜리) 행으로 둔다. CategoryPairRow는 slugs 1~2개를 모두 받는다.
const CATEGORY_PAIRS: readonly (readonly string[])[] = [
  ['markets', 'property'],
  ['economy', 'finance'],
  ['industry', 'politics'],
  ['national', 'international'],
  ['culture'],
];

function CategoryPairRow({
  slugs,
  archiveItems,
}: {
  slugs: readonly string[];
  archiveItems: ArchiveItem[];
}) {
  const configs = slugs.map((slug) => ECON_CATEGORIES.find((c) => c.slug === slug)!);
  const itemsBySlug = configs.map((cfg) => archiveItems.filter((it) => categoryMatches(cfg, it.category)));
  if (itemsBySlug.every((items) => items.length === 0)) return null;
  // 행 사이 구분선은 두지 않는다. CategoryFeatureSection이 각각 자기 카드(배경+테두리+그림자)를 가지므로 카드 밖 구분선은 이중 프레임이 되며, 카드 사이 간격(marginTop)만으로 행을 구분한다.
  return (
    <div style={{ marginTop: 'clamp(32px, 4.4vw, 48px)' }}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8" style={{ marginBottom: 8 }}>
        <CategoryFeatureSection config={configs[0]} items={itemsBySlug[0]} span="wide" />
        {configs[1] && <CategoryFeatureSection config={configs[1]} items={itemsBySlug[1]} span="narrow" />}
      </div>
    </div>
  );
}

interface Props {
  selectedDate: Date;
  setSelectedDate: (date: Date) => void;
  calendarMonth: Date;
  setCalendarMonth: (date: Date) => void;
  showCalendar: boolean;
  setShowCalendar: (show: boolean) => void;
  selectedGroup: MbtiGroupId;
  onMbtiChange?: (group: MbtiGroupId) => void;
  // 빌드타임(app/page.tsx) 서버 프리페치 값을 각 섹션에 하향 전달한다. 없으면 각 섹션이 클라이언트에서 로드한다.
  initialWebtoons?: CmsWebtoon[];
  initialVideos?: CmsVideo[];
  initialLensPosts?: CmsLens[];
  paperDates?: string[];
  // "최신 뉴스" 그리드와 카테고리 레일이 공유하는 letters 원본. 한 번만 fetch해 최신순 슬라이스와 카테고리별 필터에 함께 사용한다(app/page.tsx 참조).
  initialArchiveItems?: ArchiveItem[];
  // 우측 사이드바(HomeSideBar) — features 레이어는 widgets를 직접 import할 수 없으므로(FSD 단방향 규칙) 렌더된 엘리먼트를 받는다.
  // 조립은 호출부(widgets/FeedPage/FeedPage.tsx)가 담당한다.
  sidebar?: ReactNode;
  // 오디오 섹션(AudioPreviewSection) 서버 프리페치 — home_player 채널(TodayNewsPlayer.tsx와 같은 소스).
  initialHomePlayerPosts?: HomePlayerPost[];
  // 본문 칼럼(gridColumn:1) 맨 위, 히어로 캐러셀 위에 얹는 배너 슬롯. sidebar와 같은 이유로 렌더된 엘리먼트를 받는다.
  topBanner?: ReactNode;
}

// 홈 구역 구분 — 구역마다 위에 가는 먹색 선 한 줄 + 일정한 간격. 각 구역의 위 여백은 선 아래 16px로 통일한다.
function HomeSection({ children }: { children: React.ReactNode }) {
  return (
    <div className="home-sec">
      <style>{`.home-sec { border-top: 1px solid #d3d6db; margin-top: clamp(32px, 4.4vw, 48px); padding-top: 16px; } .home-sec > section { padding-top: 0 !important; } .home-sec > section > header { margin-top: 0; }`}</style>
      {children}
    </div>
  );
}

export function NewsFeedTab({
  initialWebtoons,
  initialVideos,
  initialLensPosts,
  paperDates,
  initialArchiveItems,
  initialHomePlayerPosts,
  sidebar,
  topBanner,
}: Props) {
  const archiveItems = initialArchiveItems ?? [];

  return (
    <div className="min-h-screen bg-white">
      {/* Noto Serif KR 로딩은 layout.tsx <head>의 <link> 하나로 통합했으므로 여기서 @import하지 않는다. */}
      <style>{`
        .editorial-title {
          font-family: 'Noto Serif KR', serif;
        }
      `}</style>

      {/*
         우측 사이드바 — 인기글(HotLettersRail)과 안내 카드(HomeSideBar)를 sticky 컨테이너로 묶는다.
         features 레이어는 widgets를 직접 import할 수 없어 `sidebar` prop으로 받으며, 조립은 widgets/FeedPage/FeedPage.tsx가 한다.
         CSS Grid 2열(본문 1fr + 사이드바 280px)이며 lg 미만에서는 사이드바가 표시되지 않는다(HomeSideBar의 className="hidden lg:block").
         모든 섹션은 본문 칼럼(gridColumn:1)에 두고, 사이드바는 gridColumn:2 하나로 본문 전체 높이만큼 늘어난다.
       */}
      <div className="mx-auto" style={{ maxWidth: 1320, padding: 'clamp(8px, 2vw, 16px) clamp(24px, 3.5vw, 44px) 0' }}>
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_280px]" style={{ columnGap: 64 }}>
          <div style={{ gridColumn: 1 }}>
            {topBanner}

            {/*
               "최신 뉴스" 히어로 자리 + 그리드 + 전체보기. 히어로 자리는 지면 특별 코너(전체/증권/산업/시그널 탭)이며,
               지면별 캐릭터 4행을 보여주려면 CmsLens.lenses가 필요하므로 범용 archiveItems가 아닌 lens 전용 데이터(initialLensPosts)를 넘긴다(LensPreviewSection.tsx 상단 주석 참조).
             */}
            <LatestGridSection
              items={archiveItems}
              heroSlot={initialLensPosts?.length ? <LensPreviewSection initialItems={initialLensPosts} paperDates={paperDates} /> : undefined}
            />

            {/*
               카테고리 섹션 — 큰 히어로 + 작은 리스트 조합으로 신문 지면처럼 배치한다(CategoryFeatureSection.tsx 참조).
               카드마다 카테고리 태그를 반복하지 않고 헤더 하나로 표시하며, 콘텐츠 없는 카테고리는 자동으로 숨는다.
               첫 번째 짝(증시+부동산)만 먼저 그리고 타임머신 섹션을 그 아래에 둔 뒤 나머지 짝을 잇는다.
             */}
            <CategoryPairRow slugs={CATEGORY_PAIRS[0]} archiveItems={archiveItems} />

            {/*
               타임머신 섹션 — 홈의 메인 훅이다. 최근 날짜는 실시간 S3 지면, 그 이전은 빅카인즈 예시를 보여 준다(NewsTimeMachineSection.tsx 상단 주석 참조).
               위치는 카테고리 섹션 첫 짝(증시+부동산) 바로 아래, 산업 짝 바로 위이다.
             */}
            <HomeSection><NewsTimeMachineSection /></HomeSection>

            <CategoryPairRow slugs={CATEGORY_PAIRS[1]} archiveItems={archiveItems} />

            {/*
               웹툰 섹션(WebtoonPreviewSection.tsx) — '국제' 단독 줄 바로 위에 둔다.
               영상 섹션을 바로 옆에 붙여 웹툰과 함께 "비주얼 콘텐츠" 블록으로 묶는다.
             */}
            <HomeSection><WebtoonPreviewSection initialItems={initialWebtoons} /></HomeSection>

            <HomeSection><VideoPreviewSection initialVideos={initialVideos} /></HomeSection>

            <CategoryPairRow slugs={CATEGORY_PAIRS[2]} archiveItems={archiveItems} />

            {/* 오디오 섹션 — /listen 목록과 같은 home_player 데이터를 텍스트 리스트로 보여 준다(AudioPreviewSection.tsx). 문화 섹션 위에 둔다. */}
            <HomeSection><AudioPreviewSection initialItems={initialHomePlayerPosts} /></HomeSection>

            {/*
               문화(culture) — 경제 카테고리 6개 짝(3줄) 이후에 추가된 카테고리라 파트너가 없어 단독 행으로 마지막에 둔다.
               콘텐츠가 없는 날은 CategoryFeatureSection이 숨긴다.
             */}
            <CategoryPairRow slugs={CATEGORY_PAIRS[3]} archiveItems={archiveItems} />

            {/*
               게임 섹션 — 본문 콘텐츠를 다 본 뒤 마지막에 만나는 "쉬어가기" 자리에 둔다.
               톤은 사이트 전역의 밝은 에디토리얼과 의도적으로 다르다. /games 라우트(GamesClient.tsx)가 다크+네온 아케이드 톤이라 그대로 가져왔다(GamesPreviewSection.tsx 상단 주석 참조, GAMES 데이터는 shared/data/games.ts 공유).
             */}
            <GamesPreviewSection />
          </div>

          {sidebar}
        </div>
      </div>

      {/* 뉴스레터 구독 섹션은 두지 않는다. onboarding 페이지의 NewsletterCTA 컴포넌트는 그대로 사용한다. */}

      {/* 하단 여백 */}
      <div className="h-32" />
    </div>
  );
}
