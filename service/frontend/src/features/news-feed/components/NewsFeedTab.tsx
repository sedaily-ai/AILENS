'use client';

import type { MbtiGroupId } from "@/shared/data/mbtiGroups";
import type { CmsVideo, CmsWebtoon, CmsLens } from "@/shared/lib/cmsPostsApi";
import type { ArchiveItem } from "@/shared/lib/archiveItems";
import type { Term } from "../lib/wordsTerms";
import { ECON_CATEGORIES } from "@/shared/constants/econCategories";
import { WebtoonPreviewSection } from "./WebtoonPreviewSection";
import { WordsPreviewSection } from "./WordsPreviewSection";
import { HomeHeroCarousel } from "./HomeHeroCarousel";
import { VideoPreviewSection } from "./VideoPreviewSection";
import { LensPreviewSection } from "./LensPreviewSection";
import { NewsTimeMachineSection } from "./NewsTimeMachineSection";
import { LatestGridSection } from "./LatestGridSection";
import { CategoryRailSection } from "./CategoryRailSection";

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

        {/* 타임머신이 메인 훅(2026-08-17, 사용자 확인: "메인은 타임라인
            뉴스보다도 생일 뉴스, 타임머신 타고 날아가는 게 메인"). 원래
            "그날의 지면"(TimelinePreviewSection)과 "생일 뉴스 타임머신"
            (BirthdayTimeMachineSection)이 따로 있었는데 "통합해야죠, 두
            개 다 있으면 안 됩니다"(같은 날) 피드백으로 하나로 합쳤다 —
            최근 날짜는 실시간 S3 지면, 그 이전은 빅카인즈 예시.
            NewsTimeMachineSection.tsx 상단 주석 참조. */}
        <NewsTimeMachineSection />

        {/* "최신 뉴스" 히어로+그리드+전체보기(2026-08-17 신설) — 예전엔
            형식 기준으로 "이슈 톡톡"(FollowingFeed)과 "인사이트"
            (ColumnPreviewSection) 두 섹션이 따로 있었는데, 상단 탭을
            형식(브리핑/인사이트)에서 주제(증시/부동산/...) 기준으로 갈아
            엎은 김에 홈도 맞췄다 — 형식 구분 없이 최신순으로 한 번에
            보여주고, 주제별 정리는 바로 아래 카테고리 레일들이 담당한다. */}
        <LatestGridSection items={archiveItems} />

        {/* 카테고리 레일 6개(2026-08-17) — 증시/부동산/산업/금융·정책/
            국제/재테크. 콘텐츠 없는 카테고리는 섹션 자체가 안 뜬다
            (CategoryRailSection 참조). */}
        {ECON_CATEGORIES.map((c) => (
          <CategoryRailSection
            key={c.slug}
            config={c}
            items={archiveItems.filter((it) => it.category === c.label)}
          />
        ))}

        {/* 섹션 재정렬(2026-08-06) — "단어 퀴즈는 문제 하나뿐이라 자리를
            많이 안 차지하니 가볍게 매일 훑는 습관을 만들고 싶다"는 피드백. */}
        <WordsPreviewSection initialTerms={initialWordTerms} />

        {/* "오늘의 이슈, 4가지 시선" 홈 티저(2026-08-12) — 하루 한 건만
            크게 보여주는 게 컨셉이라(다른 섹션의 "여러 개 나열"과 대비)
            독립 섹션으로 유지. LensPreviewSection.tsx 참조. */}
        <LensPreviewSection initialItems={initialLensPosts} />

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
