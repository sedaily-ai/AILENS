'use client';

import type { MbtiGroupId } from "@/shared/data/mbtiGroups";
import type { MbtiArticle } from "@/shared/types/mbti";
import { getWeekDays, isSameDay } from "@/shared/utils/dateUtils";
import { FollowingFeed } from "./FollowingFeed";
import { SideRail } from "./SideRail";
import { BrandIntro } from "./BrandIntro";
import { TrendingEconomySection } from "./TrendingEconomySection";
import { ColumnPreviewSection } from "./ColumnPreviewSection";
import { NewsletterCTA } from "./NewsletterCTA";

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
    nickname: "팩트 큐레이터",
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
      {/* 스타일 정의 */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@400;500;600;700;900&display=swap');

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
          {/* 브랜드 인트로 — 히어로 + LENS 의미 + 4타입 2x2(클릭→레터) */}
          <BrandIntro />

          {/* 브랜드 인트로와 레터 리스트 사이 구분선 */}
          <hr
            style={{
              border: 'none',
              borderTop: '1px solid #eeeeec',
              margin: 'clamp(4px, 1vw, 8px) 0 clamp(20px, 3vw, 28px)',
            }}
          />

          <FollowingFeed selectedGroup={selectedGroup} />

          {/* 어피티/뉴닉처럼 홈에 경제 콘텐츠 섹션을 더 — 아직 실제 데이터 없어서
              목업(TrendingEconomySection/ColumnPreviewSection 파일 상단 참고). */}
          <TrendingEconomySection />
          <ColumnPreviewSection />
        </div>
        <div className="order-2 lg:order-2" style={{ paddingTop: 'clamp(18px, 3vw, 34px)' }}>
          <SideRail selectedGroup={selectedGroup} />
        </div>
      </div>

      {/* 뉴스레터 구독 — 페이지 맨 하단으로 이동(전에는 레터 리스트 바로 아래였음) */}
      <div className="mx-auto" style={{ maxWidth: 1440, padding: 'clamp(24px, 4vw, 40px) clamp(24px, 3.5vw, 44px) 0' }}>
        <NewsletterCTA />
      </div>

      {/* 하단 여백 */}
      <div className="h-32" />
    </div>
  );
}
