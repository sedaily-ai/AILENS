'use client';

import Link from "next/link";
import type { MbtiGroupId } from "@/shared/data/mbtiGroups";
import type { MbtiArticle } from "@/shared/types/mbti";
import { getWeekDays, isSameDay } from "@/shared/utils/dateUtils";
import { FollowingFeed } from "./FollowingFeed";
import { SideRail } from "./SideRail";
import { TrendingEconomySection } from "./TrendingEconomySection";
import { ColumnPreviewSection } from "./ColumnPreviewSection";
import { WebtoonPreviewSection } from "./WebtoonPreviewSection";
import { WordsPreviewSection } from "./WordsPreviewSection";
import { HomeHeroCarousel } from "./HomeHeroCarousel";
import { MiniHeadlinesSection } from "./MiniHeadlinesSection";
import { VideoPreviewSection } from "./VideoPreviewSection";

interface Props {
  selectedDate: Date;
  setSelectedDate: (date: Date) => void;
  calendarMonth: Date;
  setCalendarMonth: (date: Date) => void;
  showCalendar: boolean;
  setShowCalendar: (show: boolean) => void;
  articles: MbtiArticle[];
  loading: boolean;
  selectedGroup: MbtiGroupId;
  onMbtiChange?: (group: MbtiGroupId) => void;
  onArticleClick: (article: MbtiArticle) => void;
}

// MBTI 유형별 스타일 정보 (제갈량·유비·관우·이태백 — V1 활성 4명)
const typeInfo = {
  NT: {
    name: "제갈량",
    names: ["제갈량", "사마의", "노자"],
    nickname: "전략가",
    color: "bg-purple-500",
    textColor: "text-purple-600",
    ringColor: "ring-purple-200",
    shadowColor: "shadow-purple-200/50",
    avatar: "/editors/intj.webp",
    tagline: "데이터로 본질을 짚어드립니다",
    pickMessage: "오늘 시장의 핵심 변수와 시나리오를 골랐어요."
  },
  NF: {
    name: "유비",
    names: ["유비", "공자", "맹자"],
    nickname: "이야기꾼",
    color: "bg-rose-500",
    textColor: "text-rose-600",
    ringColor: "ring-rose-200",
    shadowColor: "shadow-rose-200/50",
    avatar: "/editors/infp.webp",
    tagline: "숫자 뒤의 사람 이야기를 함께 읽어요",
    pickMessage: "마음이 움직였던 한 편, 당신도 같이 느껴봐요."
  },
  ST: {
    name: "관우",
    names: ["관우", "조조", "한비자"],
    nickname: "실용주의자",
    color: "bg-emerald-500",
    textColor: "text-emerald-700",
    ringColor: "ring-emerald-200",
    shadowColor: "shadow-emerald-200/50",
    avatar: "/editors/istj.webp",
    tagline: "결론부터. 원칙은 변하지 않아요",
    pickMessage: "핵심만 딱, 바로 써먹을 수 있는 한 편."
  },
  SF: {
    name: "이태백",
    names: ["이태백", "조자룡", "방통"],
    nickname: "감성 캐스터",
    color: "bg-amber-500",
    textColor: "text-amber-700",
    ringColor: "ring-amber-200",
    shadowColor: "shadow-amber-200/50",
    avatar: "/editors/esfp.webp",
    tagline: "한 잔 술에 천하가 담겨요 🍷",
    pickMessage: "오늘 하루, 시 한 수처럼 가볍게 만나요."
  },
};

export function NewsFeedTab({
  selectedDate,
  setSelectedDate,
  calendarMonth,
  setCalendarMonth,
  showCalendar,
  setShowCalendar,
  articles,
  loading,
  selectedGroup,
  onMbtiChange,
  onArticleClick,
}: Props) {
  const filteredArticles = articles;
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

      {/* 주간 날짜 탭 제거 — 날짜·일정 선택은 별도 캘린더 탭으로 이전.
          오늘 탭 = 글 피드만 깔끔하게. */}

      {/* "한 통 레터" 컨셉 — 기사 수·오디오 브리핑 UI 제거 (Out of Scope) */}

      {/* 미디엄식 2단 — 좌측(브랜드 인트로 + 레터 리스트) + 우측 사이드바(캘린더·인기 에디터).
          사이드바가 브랜드 인트로와 같은 높이(맨 위)부터 시작하도록 전체를 한 그리드로 묶음.
          모바일은 1열 + 사이드바 콘텐츠를 아래로 이동 (lg:order로 데스크탑에서만 우측). */}
      <div
        className="mx-auto grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(220px,260px)] lg:gap-8"
        style={{
          maxWidth: 1440,
          padding: 'clamp(8px, 2vw, 16px) clamp(24px, 3.5vw, 44px) 0',
        }}
      >
        <div className="order-1 lg:order-1" style={{ minWidth: 0 }}>
          {/* 브랜드 인트로(히어로+LENS 설명+4타입 카드)와 그 아래 구분선 제거 —
              /editors·온보딩과 내용이 겹치는데 실제 콘텐츠를 스크롤 한참
              아래로 밀어냈다 (2026-08-06 피드백). 필요하면 git 이력에서 복원 가능.
              대신 그 자리에 "단어장" 진입 배너 — 레서(edtech) 참고, 크게 자리
              차지하던 브랜드 인트로와 달리 한 줄짜리 슬림 바로.
              검정 단색 바 → amber 그라데이션 + 💡 이모지로 바꿨다가, "이모지는
              AI 티가 나고 그라데이션도 안 세련됐다, 손그림 아이콘처럼 정성이
              보여야 한다"는 피드백(2026-08-06) — 이모지를 걷어내고 Trend/Column
              카드가 이미 쓰는 손그림 라인아트 아이콘(HandDrawnIcons)을 그대로
              가져왔다. 배경도 그라데이션 대신, 그 카드들의 accentBg 팔레트와
              같은 플랫 컬러로 — 이 사이트에서 "고른 디자인"은 그라데이션이
              아니라 손그림 아이콘 + 플랫 컬러라는 게 이미 확립된 패턴이다.
              이후 "한 줄 배너 형태가 맞나, 트렌드·칼럼·웹툰은 다 카드형인데
              단어장만 배너라 안 어울린다"는 피드백(같은 날) — 배너를 걷어내고
              실제 단어 몇 개를 카드로 보여주는 WordsPreviewSection으로 교체해
              다른 섹션들과 리듬을 맞췄다. */}
          {/* 홈 히어로 배너(2026-08-06) — "신문 읽는 스타일" 이벤트 단일 배너였다가
              "점박이(캐러셀 도트) 있어야 배너답다, 웹툰·사주도 같이 소개하자"는
              피드백으로 3슬라이드 캐러셀(HomeHeroCarousel.tsx)로 확장. */}
          <HomeHeroCarousel />

          {/* 섹션 재정렬(2026-08-06) — 오늘 하루 기능을 하나씩 얹다 보니
              본편(오늘의 레터)이 다섯 번째 섹션까지 밀려나 있었다("재밌는
              부가기능이 본편을 가린다"는 피드백)로 한 번 정리했다가, "단어
              퀴즈는 문제 하나뿐이라 자리를 많이 안 차지하니 최상단에 둬서
              '가볍게 매일 훑는 습관'을 만들고 싶다, 웹툰도 좋아할 형식이라
              맨 아래로 묻히면 아깝다"는 재피드백(같은 날)으로 다시 조정 —
              퀴즈(5초짜리 습관 훅) → 본편 → 웹툰(재미 요소) → 트렌드/칼럼 →
              미니헤드라인(가장 실험적인 기능이라 맨 뒤) 순서로. */}
          <WordsPreviewSection />

          <FollowingFeed selectedGroup={selectedGroup} />

          {/* 웹툰 파일럿(2026-08-06) — 처음엔 상단 슬림 배너였는데 "실제 콘텐츠처럼
              안 보인다"는 피드백으로 트렌드·칼럼과 같은 카드형으로 교체
              (WebtoonPreviewSection.tsx). */}
          <WebtoonPreviewSection />

          {/* 어피티/뉴닉처럼 홈에 경제 콘텐츠 섹션을 더 — 아직 실제 데이터 없어서
              목업(TrendingEconomySection/ColumnPreviewSection 파일 상단 참고). */}
          <TrendingEconomySection />
          <ColumnPreviewSection />

          {/* 영상 콘텐츠(2026-08-06) — admin이 YouTube 링크를 CMS에 붙여넣으면
              뜬다(VideoPreviewSection.tsx). 실제 영상이 없으면 섹션 자체를
              숨긴다 — 트렌드/칼럼처럼 목업으로 안 채운다. */}
          <VideoPreviewSection />

          {/* 미니보험식 헤드라인 패키징(2026-08-06) — 무료 묶음은 실제로 작동,
              유료 묶음(200원)은 PG 연동 전이라 잠금 UI로 컨셉만
              (MiniHeadlinesSection.tsx). */}
          <MiniHeadlinesSection />
        </div>
        <div className="order-2 lg:order-2" style={{ paddingTop: 'clamp(18px, 3vw, 34px)' }}>
          <SideRail selectedGroup={selectedGroup} />
        </div>
      </div>

      {/* 뉴스레터 구독 섹션 삭제(2026-08-06 피드백) — onboarding 페이지엔
          NewsletterCTA가 그대로 남아있어 컴포넌트 자체는 안 지웠다. */}

      {/* 하단 여백 */}
      <div className="h-32" />
    </div>
  );
}
