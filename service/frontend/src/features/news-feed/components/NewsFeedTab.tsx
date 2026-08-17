'use client';

import type { MbtiGroupId } from "@/shared/data/mbtiGroups";
import type { CmsVideo, CmsWebtoon, CmsLens } from "@/shared/lib/cmsPostsApi";
import type { ArchiveItem } from "@/shared/lib/archiveItems";
import type { Term } from "../lib/wordsTerms";
import { WebtoonPreviewSection } from "./WebtoonPreviewSection";
import { WordsPreviewSection } from "./WordsPreviewSection";
import { HomeHeroCarousel } from "./HomeHeroCarousel";
import { VideoPreviewSection } from "./VideoPreviewSection";
import { LensPreviewSection } from "./LensPreviewSection";
import { NewsTimeMachineSection } from "./NewsTimeMachineSection";
import { LatestGridSection } from "./LatestGridSection";
import { CategoryFeatureSection } from "./CategoryFeatureSection";
import { ECON_CATEGORIES } from "@/shared/constants/econCategories";

// 카테고리 2개씩 짝지어 한 줄(2/3+1/3)로 배치(2026-08-17, 본지 en.sedaily.com
// 참고 — 로컬 경로 1_ailink/globe/dev/frontend/src/components/home/HeroSection.tsx
// 의 Markets+Property, Politics+Society, Culture+International 페어링과 동일
// 원칙). 순서는 ECON_CATEGORIES 정의 순서(증시/부동산/산업/금융·정책/국제/재테크)를
// 그대로 2개씩 묶는다.
const CATEGORY_PAIRS: readonly [string, string][] = [
  ['markets', 'property'],
  ['industry', 'finance'],
  ['international', 'investing'],
];

function CategoryPairRow({
  pair,
  archiveItems,
  first,
}: {
  pair: readonly [string, string];
  archiveItems: ArchiveItem[];
  first: boolean;
}) {
  const [wideSlug, narrowSlug] = pair;
  const wideCfg = ECON_CATEGORIES.find((c) => c.slug === wideSlug)!;
  const narrowCfg = ECON_CATEGORIES.find((c) => c.slug === narrowSlug)!;
  const wideItems = archiveItems.filter((it) => it.category === wideCfg.label);
  const narrowItems = archiveItems.filter((it) => it.category === narrowCfg.label);
  if (wideItems.length === 0 && narrowItems.length === 0) return null;
  return (
    <div style={{ borderTop: first ? 'none' : '2px solid #111827', paddingTop: first ? 0 : 32 }}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8" style={{ marginTop: 32, marginBottom: 32 }}>
        <CategoryFeatureSection config={wideCfg} items={wideItems} span="wide" />
        <CategoryFeatureSection config={narrowCfg} items={narrowItems} span="narrow" />
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
  // 빌드타임(app/page.tsx) 서버 프리페치 값 — 각 섹션에 그대로 하향 전달
  // (2026-08-07, 홈 SSG 감사). 없으면 각 섹션이 기존처럼 클라이언트에서 로드.
  initialWebtoons?: CmsWebtoon[];
  initialVideos?: CmsVideo[];
  initialWordTerms?: Term[];
  initialLensPosts?: CmsLens[];
  // "최신 뉴스" 그리드 + 카테고리 레일이 공유하는 letters 원본(2026-08-17,
  // 홈 구조 개편) — 한 번만 fetch해서 최신순 슬라이스와 카테고리별 필터
  // 양쪽에 다 쓴다(app/page.tsx 참조).
  initialArchiveItems?: ArchiveItem[];
}

export function NewsFeedTab({
  initialWebtoons,
  initialVideos,
  initialWordTerms,
  initialLensPosts,
  initialArchiveItems,
}: Props) {
  const archiveItems = initialArchiveItems ?? [];

  return (
    <div className="min-h-screen bg-white">
      {/* Noto Serif KR 로딩은 layout.tsx <head>의 <link> 하나로 통합했다
          (2026-08-06 폰트 감사 — 이 컴포넌트를 포함해 3곳이 각자 렌더 블로킹
          @import를 중복 실행하고 있었음). */}
      <style>{`
        .editorial-title {
          font-family: 'Noto Serif KR', serif;
        }
      `}</style>

      {/* 단일 컬럼 전체폭(2026-08-17, 뉴닉 홈 구조 참고) — 우측 사이드바
          (SideRail: 사주 궁합·오늘 가장 많이 읽힌 글)를 걷어냈다("우측
          사이드에 있는것도 치우시죠", 사용자 확인). SideRail.tsx 자체는
          레터 상세 페이지(LetterDetailClient.tsx)가 여전히 쓰고 있어
          파일은 안 지웠다 — 여기서만 렌더를 뺐다. */}
      <div
        className="mx-auto"
        style={{
          maxWidth: 1000,
          padding: 'clamp(8px, 2vw, 16px) clamp(24px, 3.5vw, 44px) 0',
        }}
      >
        {/* 홈 히어로 배너(2026-08-06) — "신문 읽는 스타일" 이벤트 단일 배너였다가
            "점박이(캐러셀 도트) 있어야 배너답다, 웹툰·사주도 같이 소개하자"는
            피드백으로 3슬라이드 캐러셀(HomeHeroCarousel.tsx)로 확장. */}
        <HomeHeroCarousel />

        {/* "최신 뉴스" 히어로 자리+그리드+전체보기(2026-08-17, 배너 바로
            아래 — 사용자가 스크린샷으로 히어로 위치를 정확히 짚어 확인).
            히어로 자리는 오늘의 "4가지 시선" 이슈로 고정(heroSlot에
            <LensPreviewSection/>을 그대로 넘김 — 카드로 축약하지 않고
            원래 디자인 그대로, 삭제·병합 아님). 별도 섹션으로 또 나열
            하면 같은 이슈가 두 번 보이는 중복이라 여기 히어로 자리
            하나로 합쳤다. 시선 발행이 없는 날은 heroSlot이 undefined가
            되어 예전처럼 최신 글이 히어로가 된다.
            예전엔 형식 기준으로 "이슈 톡톡"(FollowingFeed)과 "인사이트"
            (ColumnPreviewSection) 두 섹션이 따로 있었는데, 상단 탭을
            형식(브리핑/인사이트)에서 주제(증시/부동산/...) 기준으로 갈아
            엎은 김에 홈도 맞췄다. */}
        <LatestGridSection
          items={archiveItems}
          heroSlot={initialLensPosts?.length ? <LensPreviewSection initialItems={initialLensPosts} /> : undefined}
        />

        {/* 카테고리 섹션(2026-08-17, 본지 en.sedaily.com 스타일 참고 — 사용자
            확인: "본지형식대로 해보시죠"). 한때 카테고리 레일(그리드형)로
            만들었다가 "레일 헤더와 카드 태그가 완전히 같은 단어라 순수
            중복"이라는 지적으로 뺐었는데, 본지 스타일은 그 문제가 없다 —
            카드마다 카테고리 태그를 다시 안 붙이고(헤더 하나로 충분하다고
            봄) 큰 히어로+작은 리스트 조합으로 "신문 지면"처럼 배치한다
            (CategoryFeatureSection.tsx 참조). 2개씩 짝지어 2/3+1/3 한 줄에
            배치, 얇은 가로선으로 구분 — 콘텐츠 없는 카테고리는 자동으로
            숨는다.
            첫 번째 짝(증시+부동산)만 여기서 먼저 그리고, 타임머신 섹션을
            그 바로 아래 끼워 넣은 뒤 나머지 짝(산업+금융정책, 국제+재테크)을
            잇는다(2026-08-17, 사용자 확인: "타임라인 이거 산업 부분 위쪽에
            끼어 넣어주시죠"). */}
        <CategoryPairRow pair={CATEGORY_PAIRS[0]} archiveItems={archiveItems} first />

        {/* 타임머신이 메인 훅(2026-08-17, 사용자 확인: "메인은 타임라인
            뉴스보다도 생일 뉴스, 타임머신 타고 날아가는 게 메인"). 원래
            "그날의 지면"(TimelinePreviewSection)과 "생일 뉴스 타임머신"
            (BirthdayTimeMachineSection)이 따로 있었는데 "통합해야죠, 두
            개 다 있으면 안 됩니다"(같은 날) 피드백으로 하나로 합쳤다 —
            최근 날짜는 실시간 S3 지면, 그 이전은 빅카인즈 예시.
            NewsTimeMachineSection.tsx 상단 주석 참조.
            위치: 카테고리 섹션 첫 짝(증시+부동산) 바로 아래, 산업 짝 바로
            위(2026-08-17, 사용자 확인). */}
        <NewsTimeMachineSection />

        {CATEGORY_PAIRS.slice(1).map((pair) => (
          <CategoryPairRow key={pair[0]} pair={pair} archiveItems={archiveItems} first={false} />
        ))}

        {/* 섹션 재정렬(2026-08-06) — "단어 퀴즈는 문제 하나뿐이라 자리를
            많이 안 차지하니 가볍게 매일 훑는 습관을 만들고 싶다"는 피드백. */}
        <WordsPreviewSection initialTerms={initialWordTerms} />

        {/* 웹툰 파일럿(2026-08-06) — 처음엔 상단 슬림 배너였는데 "실제 콘텐츠처럼
            안 보인다"는 피드백으로 카드형으로 교체(WebtoonPreviewSection.tsx). */}
        <WebtoonPreviewSection initialItems={initialWebtoons} />

        {/* 영상 콘텐츠(2026-08-06) — admin이 YouTube 링크를 CMS에 붙여넣으면
            뜬다(VideoPreviewSection.tsx). 실제 영상이 없으면 섹션 자체를
            숨긴다 — 목업으로 안 채운다. */}
        <VideoPreviewSection initialVideos={initialVideos} />
      </div>

      {/* 뉴스레터 구독 섹션 삭제(2026-08-06 피드백) — onboarding 페이지엔
          NewsletterCTA가 그대로 남아있어 컴포넌트 자체는 안 지웠다. */}

      {/* 하단 여백 */}
      <div className="h-32" />
    </div>
  );
}
