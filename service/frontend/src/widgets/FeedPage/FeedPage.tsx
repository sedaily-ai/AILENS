'use client';

import { useState, useEffect, useCallback } from "react";
import { usePathname } from "next/navigation";
import type { MbtiGroupId } from "@/shared/data/mbtiGroups";
import type { CmsVideo, CmsWebtoon, CmsLens } from "@/shared/lib/api/cmsPostsApi";
import type { ArchiveItem } from "@/shared/lib/content/archiveItems";
import type { TodayLetterCardLike } from "@/shared/lib/api/todayLettersApi";
import type { HomePlayerPost } from "@/shared/lib/api/homePlayerApi";
import { fetchDailyQuestions, saveQuestionAnswer } from "@/shared/lib/api/questionApi";
import type { DailyQuestionItem } from "@/features/question";
import { SearchOverlay } from "@/shared/ui/search/SearchOverlay";
import { useAuth } from "@/features/auth";
import { Header } from "@/widgets/Header";
import { HomeSideBar } from "@/widgets/HomeSideBar";
import { ComingSoonNotice } from "@/shared/ui/notice/ComingSoonNotice";

// Feature Tab Components
import { QuestionTab, dailyQuestions } from "@/features/question";
import { NewsFeedTab } from "@/features/news-feed";
import { ArchiveTab } from "@/features/archive";
import { buildHeaderTabs } from "@/shared/lib/headerTabs";
import { formatDateStr } from "@/shared/utils/dateUtils";

interface Props {
  selectedGroup: MbtiGroupId;
  onChangeGroup?: () => void;
  onSwitchToStory?: () => void;
  onMbtiChange?: (group: MbtiGroupId) => void;
  // 빌드타임(app/page.tsx) 서버 프리페치 값. NewsFeedTab까지 그대로 하향 전달한다.
  initialWebtoons?: CmsWebtoon[];
  initialVideos?: CmsVideo[];
  initialLensPosts?: CmsLens[];
  paperDates?: string[];
  initialArchiveItems?: ArchiveItem[];
  initialHotLetters?: TodayLetterCardLike[];
  initialHomePlayerPosts?: HomePlayerPost[];
}

// 아카이빙된 문장 타입
interface ArchivedSentence {
  id: string;
  text: string;
  articleId: string;
  articleTitle: string;
  articlePublishedAt?: string; // 기사 발행일
  createdAt: Date; // 저장일
}

const isSameDay = (d1: Date, d2: Date): boolean => {
  return d1.getFullYear() === d2.getFullYear() &&
         d1.getMonth() === d2.getMonth() &&
         d1.getDate() === d2.getDate();
};

const getMonthDays = (year: number, month: number): (Date | null)[] => {
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startPadding = (firstDay.getDay() + 6) % 7; // 월요일 시작

  const days: (Date | null)[] = [];
  for (let i = 0; i < startPadding; i++) days.push(null);
  for (let i = 1; i <= lastDay.getDate(); i++) {
    days.push(new Date(year, month, i));
  }
  return days;
};


export function FeedPage({
  selectedGroup,
  onMbtiChange,
  initialWebtoons,
  initialVideos,
  initialLensPosts,
  paperDates,
  initialArchiveItems,
  initialHotLetters,
  initialHomePlayerPosts,
}: Props) {
  const pathname = usePathname();
  const { user } = useAuth();

  // 날짜 관련 상태
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [showCalendar, setShowCalendar] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState<Date>(new Date());

  // 질문 관련 상태
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string>>({});
  const [aiQuestions, setAiQuestions] = useState<DailyQuestionItem[]>([]);

  // "내 서랍": 로그인 사용자는 ArchiveTab의 useEffect가 마운트 시 /api/archive의 실제 서버 데이터로 덮어쓴다.
  // 비로그인은 빈 배열 그대로이며 ArchiveLoginCta가 로그인을 유도한다(가짜 콘텐츠를 노출하지 않는다).
  const [archivedSentences, setArchivedSentences] = useState<ArchivedSentence[]>([]);
  // 탭 상태: URL에서 초기값을 읽는다.
  // 정적 export에서 useSearchParams()는 CSR bailout을 유발해 컴포넌트 트리 전체가 Suspense fallback으로만 구워진다.
  // 따라서 초기값은 항상 "feed"로 고정해 서버/클라이언트 첫 렌더를 일치시키고, ?tab=... 반영은 아래 mount effect가
  // window.location.search를 직접 읽어 처리한다.
  const [activeTab, setActiveTabState] = useState<"question" | "feed" | "archive" | "dna">("feed");

  // 탭 변경 함수. URL도 함께 갱신한다(replaceState로 히스토리에 쌓이지 않는다).
  // "feed"는 기본 탭이라 쿼리스트링을 지운다("/?tab=feed"가 남지 않게). question/archive/dna처럼 비기본 탭은 새로고침 유지를 위해 남긴다.
  const setActiveTab = useCallback((tab: "question" | "feed" | "archive" | "dna") => {
    setActiveTabState(tab);
    const params = new URLSearchParams(window.location.search);
    if (tab === "feed") {
      params.delete('tab');
    } else {
      params.set('tab', tab);
    }
    const qs = params.toString();
    window.history.replaceState(
      { ...window.history.state, tab },
      "",
      `${pathname}${qs ? `?${qs}` : ''}${window.location.hash}`
    );
  }, [pathname]);

  // 펼친 기사 상태: 값은 읽지 않지만(렌더에 영향 없음) setter는 자식에 넘긴다.
  const [, setExpandedArticles] = useState<Set<string>>(new Set());

  // 내 서랍 날짜 필터
  const [archiveDate, setArchiveDate] = useState<Date>(new Date()); // 오늘부터 시작

  // 저장 완료 토스트: 값(showSaveToast)을 렌더에 쓰지 않아 setter만 유지하고, showToast() 호출부(자식으로 전달)는 그대로 둔다.
  const [, setShowSaveToast] = useState(false);

  // 토스트 표시 함수
  const showToast = () => {
    setShowSaveToast(true);
    setTimeout(() => setShowSaveToast(false), 2500);
  };

  const [showSearch, setShowSearch] = useState(false);

  // AI 질문 로드
  useEffect(() => {
    const dateStr = formatDateStr(selectedDate);
    fetchDailyQuestions(dateStr).then(qs => setAiQuestions(qs));
  }, [selectedDate]);

  useEffect(() => {
    const handlePopState = () => {
      // URL에서 탭 상태 복원
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get('tab');
      if (tabParam && ['question', 'feed', 'archive', 'dna'].includes(tabParam)) {
        setActiveTabState(tabParam as typeof activeTab);
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  // 다른 라우트에서 ?tab=... 로 진입했을 때의 초기 반영. 마운트 시 1회 window.location.search를 직접 읽는다(useSearchParams() 대신).
  // 다른 라우트에서 오는 진입은 항상 새 마운트라 1회 실행으로 충분하다.
  // useState 지연 초기화로 옮기지 않는 이유: 서버 렌더 시점에는 window가 없어 URL 기준으로 초기값을 계산하면
  // 서버 HTML과 클라이언트 첫 렌더가 달라지는 하이드레이션 불일치가 생긴다. "일단 feed로 그리고 마운트 후 전환"이 의도된 동작이다.
  useEffect(() => {
    const tabParam = new URLSearchParams(window.location.search).get('tab');
    if (tabParam && ['question', 'feed', 'archive', 'dna'].includes(tabParam)) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setActiveTabState(tabParam as typeof activeTab);
    }
  }, []);

  // 질문 답변 선택
  const activeQuestionsList = aiQuestions.length > 0 ? aiQuestions : dailyQuestions;

  const handleSelectAnswer = (questionId: string, optionId: string, mbti?: MbtiGroupId) => {
    setSelectedAnswers(prev => ({ ...prev, [questionId]: optionId }));

    // MBTI 변경이 있으면 적용
    if (mbti && onMbtiChange) {
      onMbtiChange(mbti);
      localStorage.setItem("mbti-group", mbti);
    }

    // 답변 서버 저장 (fire-and-forget)
    if (user?.userId && mbti) {
      saveQuestionAnswer({ user_id: user.userId, question_id: questionId, option_id: optionId, mbti });
    }

    // 다음 질문으로 또는 피드로
    if (currentQuestionIndex < activeQuestionsList.length - 1) {
      setTimeout(() => setCurrentQuestionIndex(prev => prev + 1), 300);
    } else {
      setTimeout(() => {
        setActiveTab("feed");
      }, 500);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex flex-col">
      {/* Header - 1단 통합 */}
      {/* 탭 배열은 headerTabs.ts의 buildHeaderTabs()를 그대로 쓴다. 이 배열의 항목은 모두 href 이동이라 onClick 전환이 없으며,
          별도 사본을 두면 상단 탭 개편 때 옛 링크가 남는다(SiteFooter.tsx CONTENT_LINKS는 아직 별도 사본이므로 주의).
          홈 화면에는 활성 탭이 없어 active 인자도 필요 없다. */}
      <Header
        onLogo={() => setActiveTab("feed")}
        onSearch={() => setShowSearch(true)}
        tabs={buildHeaderTabs()}
      />

      <SearchOverlay open={showSearch} onClose={() => setShowSearch(false)} />

      {/* 메인 콘텐츠 */}
      <style>{`
        @keyframes tabFadeIn {
          0% { opacity: 0; transform: translateY(6px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .tab-fade-in { animation: tabFadeIn 0.25s ease-out both; }
      `}</style>
      <main className="flex-1">
        {/* 홈(/)에는 sr-only h1로 페이지 주제 신호를 준다. 각 섹션이 h2부터 동등한 weight로 시작해 하나를 h1으로 승격하면
            시각 위계가 깨지므로, title/og:title과 같은 문구를 시각적으로 숨겨 추가한다(GEO·접근성). */}
        <h1 className="sr-only">AI LENS — 서울경제신문의 AI 경제 뉴스</h1>
        <div key={activeTab} className="tab-fade-in">
        {/* 질문 모드 - QuestionTab 컴포넌트 */}
        {activeTab === "question" && (
          <QuestionTab
            currentQuestionIndex={currentQuestionIndex}
            selectedAnswers={selectedAnswers}
            onSelectAnswer={handleSelectAnswer}
            onSkip={() => {
              setActiveTab("feed");
            }}
            selectedGroup={selectedGroup}
          />
        )}

        {/* 피드 모드 - NewsFeedTab 컴포넌트 */}
        {activeTab === "feed" && (
          <NewsFeedTab
            selectedDate={selectedDate}
            setSelectedDate={setSelectedDate}
            calendarMonth={calendarMonth}
            setCalendarMonth={setCalendarMonth}
            showCalendar={showCalendar}
            setShowCalendar={setShowCalendar}
            selectedGroup={selectedGroup}
            onMbtiChange={onMbtiChange}
            initialWebtoons={initialWebtoons}
            initialVideos={initialVideos}
            initialLensPosts={initialLensPosts}
            paperDates={paperDates}
            initialArchiveItems={initialArchiveItems}
            initialHomePlayerPosts={initialHomePlayerPosts}
            sidebar={
              <HomeSideBar className="hidden lg:block" initialHotLetters={initialHotLetters} railLimit={6} style={{ paddingTop: 52 }} />
            }
          />
        )}

        {/* 아카이브 모드 - 내 서랍 */}
        {activeTab === "archive" && (
          <ArchiveTab
            archiveDate={archiveDate}
            setArchiveDate={setArchiveDate}
            archivedSentences={archivedSentences}
            setArchivedSentences={setArchivedSentences}
            setActiveTab={setActiveTab}
            setExpandedArticles={setExpandedArticles}
            articles={[]}
            showToast={showToast}
            setShowCalendar={setShowCalendar}
          />
        )}

        {/* DNA 모드 - Coming Soon */}
        {activeTab === "dna" && (
          <ComingSoonNotice
            feature="dna"
            title="나의 DNA는 곧 만나요"
            description={"읽은 기사로 나만의 관심사 지도를 그려드릴게요.\n출시 소식을 가장 먼저 보내드릴게요."}
          />
        )}
        </div>

      </main>

      {/* 캘린더 팝업 — 최상위 렌더링 */}
      {showCalendar && (
        <div
          className="fixed inset-0 z-[150] flex items-center justify-center bg-black/30 animate-[fadeIn_0.15s_ease-out]"
          onClick={() => setShowCalendar(false)}
        >
          <style>{`
            @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
            @keyframes calendarIn {
              0% { opacity: 0; transform: scale(0.95) translateY(8px); }
              100% { opacity: 1; transform: scale(1) translateY(0); }
            }
          `}</style>
          <div
            className="bg-white rounded-2xl shadow-2xl p-6 w-[340px] animate-[calendarIn_0.25s_cubic-bezier(0.16,1,0.3,1)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <button
                onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1))}
                className="p-2 hover:bg-gray-50 rounded-full transition-colors"
              >
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <span className="text-[16px] font-bold text-gray-900">
                {calendarMonth.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' })}
              </span>
              <button
                onClick={() => setCalendarMonth(new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1))}
                className="p-2 hover:bg-gray-50 rounded-full transition-colors"
              >
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>

            {/* 날짜 직접 입력 */}
            <div className="mb-4">
              <input
                type="text"
                placeholder="YYYY.MM.DD"
                defaultValue={`${selectedDate.getFullYear()}.${String(selectedDate.getMonth() + 1).padStart(2, '0')}.${String(selectedDate.getDate()).padStart(2, '0')}`}
                onKeyDown={(e) => {
                  if (e.key !== 'Enter') return;
                  const val = (e.target as HTMLInputElement).value.replace(/[^\d]/g, '');
                  if (val.length !== 8) return;
                  const d = new Date(`${val.slice(0, 4)}-${val.slice(4, 6)}-${val.slice(6, 8)}`);
                  if (!isNaN(d.getTime()) && d <= new Date()) {
                    if (activeTab === 'archive') setArchiveDate(d);
                    else setSelectedDate(d);
                    setCalendarMonth(d);
                    setShowCalendar(false);
                  }
                }}
                className="w-full px-3 py-2.5 bg-gray-50 rounded-xl text-[14px] text-center text-gray-700 tracking-wider focus:outline-none focus:ring-2 focus:ring-blue-100 focus:bg-white transition-all"
              />
            </div>

            <div className="grid grid-cols-7 gap-1 mb-1">
              {['월', '화', '수', '목', '금', '토', '일'].map((d, i) => (
                <div key={d} className={`text-center text-[11px] font-medium py-2 ${
                  i === 5 ? 'text-blue-400' : i === 6 ? 'text-rose-400' : 'text-gray-400'
                }`}>{d}</div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-0.5">
              {getMonthDays(calendarMonth.getFullYear(), calendarMonth.getMonth()).map((day, idx) => {
                if (!day) return <div key={idx} />;
                const currentDate = activeTab === 'archive' ? archiveDate : selectedDate;
                const isSelected = isSameDay(day, currentDate);
                const isToday = isSameDay(day, new Date());
                const isFuture = day > new Date();
                const dow = day.getDay();

                return (
                  <button
                    key={idx}
                    onClick={() => {
                      if (!isFuture) {
                        if (activeTab === 'archive') setArchiveDate(day);
                        else setSelectedDate(day);
                        setShowCalendar(false);
                      }
                    }}
                    disabled={isFuture}
                    className={`aspect-square flex items-center justify-center rounded-full text-[14px] transition-all duration-150 ${
                      isSelected
                        ? "bg-blue-500 text-white font-bold shadow-sm"
                        : isToday
                          ? "ring-2 ring-blue-200 text-blue-600 font-semibold"
                          : isFuture
                            ? "text-gray-200 cursor-not-allowed"
                            : dow === 0
                              ? "text-rose-400 hover:bg-rose-50"
                              : dow === 6
                                ? "text-blue-400 hover:bg-blue-50"
                                : "text-gray-700 hover:bg-gray-50"
                    }`}
                  >
                    {day.getDate()}
                  </button>
                );
              })}
            </div>

            {!isSameDay(activeTab === 'archive' ? archiveDate : selectedDate, new Date()) && (
              <button
                onClick={() => {
                  if (activeTab === 'archive') setArchiveDate(new Date());
                  else setSelectedDate(new Date());
                  setShowCalendar(false);
                }}
                className="w-full mt-5 py-3 text-[14px] font-medium text-blue-500 hover:bg-blue-50 rounded-xl transition-colors"
              >
                오늘로 이동
              </button>
            )}
          </div>
        </div>
      )}

    </div>
  );
}
