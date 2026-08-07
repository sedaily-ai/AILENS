'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import Link from "next/link";
import type { MbtiGroupId } from "@/shared/data/mbtiGroups";
import type { MbtiVersion } from "@/shared/types/mbti";
import { API_URL } from "@/shared/config/api";
import { fetchDailyQuestions, saveQuestionAnswer } from "@/shared/lib/questionApi";
import type { DailyQuestionItem } from "@/features/question";
import { ArticleView } from "./ArticleView";
import { SmartSearchOverlay } from "./SmartSearchOverlay";
import { useAuth } from "@/features/auth";
import { Header } from "@/widgets/Header";
import { mockArticles } from "@/shared/data/mockArticles";
import { ComingSoonNotice } from "@/shared/ui/ComingSoonNotice";

// Feature Tab Components
import { QuestionTab, dailyQuestions } from "@/features/question";
import { NewsFeedTab } from "@/features/news-feed";
import { ArchiveTab } from "@/features/archive";
import { TIMELINE_HREF } from "@/shared/lib/headerTabs";

// 프리페칭 캐시
const prefetchCache = new Map<string, Article>();
// 날짜별 기사 목록 캐시
const articleListCache = new Map<string, Article[]>();

interface Article {
  news_id: string;
  title: string;
  sub_title: string;
  published_at: string;
  category: string;
  provider: string;
  byline: string;
  image_url: string | null;
  content: string;
  original_link: string;
  versions?: Record<string, MbtiVersion>;
}

// ─── v2 → v1 shape 어댑터 (TASK-7) ─────────────────────────────────────
// v2 Feed API 응답 (items[]) 을 기존 컴포넌트들이 기대하는 v1-shape Article로
// 매핑. v1 필드명 일부가 v2에서 rename됐고, 일부 필드는 v2에 없음:
//   provider     ← v2.press
//   original_link ← v2.url
//   content      ← v2.body_preview (200자, ArticleView에서 전체 본문 fetch)
//   image_url    ← v2엔 없음 (Collector v2 미수집). null 두면 ArticleCard가
//                  ImagePlaceholder로 자동 fallback (코드 변경 0).
//   versions     ← v2엔 없음 (Article API 4-parallel fetch가 채움)
//
// sub_title은 v2에서 raw HTML <br/> 포함 가능. 카드는 첫 줄만 보이므로
// 첫 <br/> 이전까지 자름 (XSS 안전, 데모 시각 임팩트 보존).
function adaptV2FeedItem(v2: Record<string, unknown>): Article {
  const subTitleRaw = (v2.sub_title as string | null) || '';
  const subTitleClean = subTitleRaw.split(/<br\s*\/?>/i)[0] || '';
  const bodyPreview = (v2.body_preview as string | null) || '';

  return {
    news_id: v2.news_id as string,
    title: (v2.title as string) || '',
    sub_title: subTitleClean,
    published_at: (v2.published_at as string) || '',
    category: (v2.category as string) || '',
    provider: (v2.press as string) || '',
    byline: (v2.byline as string) || '',
    image_url: (v2.image_url as string) || null,
    content: bodyPreview,
    original_link: (v2.url as string) || '',
    versions: undefined,
  };
}

interface Props {
  selectedGroup: MbtiGroupId;
  onChangeGroup: () => void;
  onSwitchToStory?: () => void;
  onMbtiChange?: (group: MbtiGroupId) => void;
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

// 날짜 헬퍼 함수들
const formatDateStr = (date: Date): string => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}${m}${d}`;
};

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


export function FeedPage({ selectedGroup, onMbtiChange }: Props) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useAuth();

  // URL에서 초기 탭 상태 읽기
  const getInitialTab = useCallback(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam && ['question', 'feed', 'archive', 'dna'].includes(tabParam)) {
      return tabParam as "question" | "feed" | "archive" | "dna";
    }
    return "feed";
  }, [searchParams]);

  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState(true);
  const [viewArticle, setViewArticle] = useState<Article | null>(null);

  // 날짜 관련 상태
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [showCalendar, setShowCalendar] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState<Date>(new Date());

  // 질문 관련 상태
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, string>>({});
  const [aiQuestions, setAiQuestions] = useState<DailyQuestionItem[]>([]);

  // 아카이빙 관련 상태 - 목업 데이터
  const [archivedSentences, setArchivedSentences] = useState<ArchivedSentence[]>(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const yesterday = new Date(today.getTime() - 86400000);
    const twoDaysAgo = new Date(today.getTime() - 2 * 86400000);
    const threeDaysAgo = new Date(today.getTime() - 3 * 86400000);

    return [
      // 오늘 저장한 문장들
      {
        id: 'mock-1',
        text: '인공지능이 인간의 창의성을 대체하는 것이 아니라, 인간의 창의성을 증폭시키는 도구로 활용될 때 가장 큰 가치를 발휘한다.',
        articleId: 'article-001',
        articleTitle: 'AI 시대, 인간 창의성의 새로운 가능성',
        articlePublishedAt: today.toISOString(),
        createdAt: new Date(today.getTime() + 10 * 3600000), // 오늘 오전 10시
      },
      {
        id: 'mock-2',
        text: '주식시장에서 가장 위험한 말은 "이번엔 다르다"이다. 역사는 반복되지 않지만, 운율은 맞춘다.',
        articleId: 'article-002',
        articleTitle: '2024년 글로벌 증시 전망과 투자 전략',
        articlePublishedAt: today.toISOString(),
        createdAt: new Date(today.getTime() + 14 * 3600000), // 오늘 오후 2시
      },
      // 어제 저장한 문장들
      {
        id: 'mock-3',
        text: '반도체 산업의 핵심은 더 이상 칩의 크기가 아니라, 에너지 효율성과 특화된 아키텍처에 있다.',
        articleId: 'article-003',
        articleTitle: '차세대 반도체 전쟁, 승자는 누구인가',
        articlePublishedAt: yesterday.toISOString(),
        createdAt: new Date(yesterday.getTime() + 9 * 3600000), // 어제 오전 9시
      },
      {
        id: 'mock-4',
        text: '스타트업의 성공은 아이디어가 아니라 실행력에서 결정된다. 좋은 아이디어는 넘쳐나지만, 끝까지 실행하는 팀은 드물다.',
        articleId: 'article-004',
        articleTitle: '유니콘 기업의 공통점: 실행력의 비밀',
        articlePublishedAt: yesterday.toISOString(),
        createdAt: new Date(yesterday.getTime() + 16 * 3600000), // 어제 오후 4시
      },
      {
        id: 'mock-5',
        text: '기후 변화 대응은 선택이 아닌 필수가 되었고, ESG는 기업의 생존 전략으로 자리잡았다.',
        articleId: 'article-005',
        articleTitle: 'ESG 경영, 지속가능한 성장의 열쇠',
        articlePublishedAt: yesterday.toISOString(),
        createdAt: new Date(yesterday.getTime() + 11 * 3600000), // 어제 오전 11시
      },
      // 2일 전
      {
        id: 'mock-6',
        text: '금리 인상 사이클의 끝이 보이기 시작했다. 이제 투자자들은 피벗 이후의 시장을 준비해야 한다.',
        articleId: 'article-006',
        articleTitle: '중앙은행의 피벗, 시장은 어떻게 반응할까',
        articlePublishedAt: twoDaysAgo.toISOString(),
        createdAt: new Date(twoDaysAgo.getTime() + 13 * 3600000),
      },
      // 3일 전
      {
        id: 'mock-7',
        text: '원격 근무가 일상이 된 시대, 기업 문화는 물리적 공간이 아닌 공유된 가치와 신뢰로 구축된다.',
        articleId: 'article-007',
        articleTitle: '하이브리드 워크 시대의 조직 문화',
        articlePublishedAt: threeDaysAgo.toISOString(),
        createdAt: new Date(threeDaysAgo.getTime() + 15 * 3600000),
      },
      {
        id: 'mock-8',
        text: '데이터는 21세기의 석유라고 불리지만, 정제되지 않은 데이터는 그저 소음에 불과하다.',
        articleId: 'article-008',
        articleTitle: '빅데이터 시대, 진짜 가치는 어디에',
        articlePublishedAt: threeDaysAgo.toISOString(),
        createdAt: new Date(threeDaysAgo.getTime() + 10 * 3600000),
      },
    ];
  });
  // 탭 상태 - URL에서 초기값 읽기
  const [activeTab, setActiveTabState] = useState<"question" | "feed" | "archive" | "dna">(getInitialTab);

  // 탭 변경 함수 - URL도 함께 업데이트 (replaceState로 히스토리에 안 쌓임)
  const setActiveTab = useCallback((tab: "question" | "feed" | "archive" | "dna") => {
    setActiveTabState(tab);
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', tab);
    window.history.replaceState(
      { ...window.history.state, tab },
      "",
      `${pathname}?${params.toString()}${window.location.hash}`
    );
  }, [pathname, searchParams]);

  // 펼친 기사 상태
  const [expandedArticles, setExpandedArticles] = useState<Set<string>>(new Set());

  // 내 서랍 날짜 필터
  const [archiveDate, setArchiveDate] = useState<Date>(new Date()); // 오늘부터 시작

  // 선택된 문장 상태 (아카이빙용)
  const [selectedSentence, setSelectedSentence] = useState<{
    text: string;
    articleId: string;
    articleTitle: string;
  } | null>(null);

  // 저장 완료 토스트
  const [showSaveToast, setShowSaveToast] = useState(false);

  // 토스트 표시 함수
  const showToast = () => {
    setShowSaveToast(true);
    setTimeout(() => setShowSaveToast(false), 2500);
  };

  // 텍스트 선택 상태 (플로팅 버튼용)
  const [textSelection, setTextSelection] = useState<{
    text: string;
    articleId: string;
    articleTitle: string;
    articlePublishedAt?: string;
    position: { x: number; y: number };
  } | null>(null);

  // 텍스트 선택 감지
  const handleTextSelect = (articleId: string, articleTitle: string, articlePublishedAt?: string) => {
    const selection = window.getSelection();
    const selectedText = selection?.toString().trim();

    if (selectedText && selectedText.length > 5) {
      const range = selection?.getRangeAt(0);
      const rect = range?.getBoundingClientRect();

      if (rect) {
        setTextSelection({
          text: selectedText,
          articleId,
          articleTitle,
          articlePublishedAt,
          position: {
            x: rect.left + rect.width / 2,
            y: rect.top - 10
          }
        });
      }
    }
  };

  // 선택 해제 감지
  useEffect(() => {
    const handleSelectionChange = () => {
      const selection = window.getSelection();
      if (!selection || selection.toString().trim().length === 0) {
        // 약간의 딜레이를 주어 버튼 클릭이 가능하도록
        setTimeout(() => {
          const currentSelection = window.getSelection();
          if (!currentSelection || currentSelection.toString().trim().length === 0) {
            setTextSelection(null);
          }
        }, 200);
      }
    };

    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, []);

  const [showSearch, setShowSearch] = useState(false);

  // AI 질문 로드
  useEffect(() => {
    const dateStr = formatDateStr(selectedDate);
    fetchDailyQuestions(dateStr).then(qs => setAiQuestions(qs));
  }, [selectedDate]);

  const openArticle = useCallback((article: Article) => {
    const cachedArticle = prefetchCache.get(article.news_id);
    setViewArticle(cachedArticle || article);
    // 현재 URL 파라미터 유지하면서 기사 해시 추가
    const currentUrl = new URL(window.location.href);
    currentUrl.hash = `article-${article.news_id}`;
    window.history.pushState({ articleId: article.news_id, tab: activeTab }, "", currentUrl.toString());
  }, [activeTab]);

  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      // 기사 보기 상태 처리
      if (viewArticle && !event.state?.articleId) {
        setViewArticle(null);
      }
      // URL에서 탭 상태 복원
      const params = new URLSearchParams(window.location.search);
      const tabParam = params.get('tab');
      if (tabParam && ['question', 'feed', 'archive', 'dna'].includes(tabParam)) {
        setActiveTabState(tabParam as typeof activeTab);
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [viewArticle]);

  // /editors 등 다른 라우트에서 ?tab=... 로 진입했을 때 초기 반영
  // (useState 초기값이 prerender 시점의 빈 searchParams를 캡처할 수 있어 별도 동기화 필요)
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam && ['question', 'feed', 'archive', 'dna'].includes(tabParam)) {
      setActiveTabState(tabParam as typeof activeTab);
    }
  }, [searchParams]);

  const handleCloseArticle = useCallback(() => {
    if (viewArticle) window.history.back();
  }, [viewArticle]);

  // 기사 로드 (TASK-7) — v2 단일 endpoint /api/v2/feed.
  // 3-tier fallback (v1 articles/s3-articles/search)은 제거. v2 백엔드는
  // Selector + Transform이 자동 fire 중이라 안정적이고, 빈 응답은 "오늘
  // 선정된 기사 없음" empty state로 graceful 처리.
  // selectedDate는 NewsFeedTab가 hide된 지금 의미가 없으므로 since 파라미터로
  // 매핑하지 않고 기본값(서버: 오늘 KST - 7일)에 맡김. selectedDate 의존성은
  // 유지해서 향후 picker 부활 시 재연결 쉬움.
  useEffect(() => {
    const dateStr = formatDateStr(selectedDate);
    const mbtiKey = (typeof window !== "undefined" ? localStorage.getItem("mbti-type") : null) || selectedGroup;
    const cacheKey = `${dateStr}|${mbtiKey}|${user?.userId ?? "anon"}`;
    const cached = articleListCache.get(cacheKey);
    if (cached) {
      setArticles(cached);
      setLoading(false);
      return;
    }

    async function fetchArticles() {
      try {
        setLoading(true);
        // Round 5-E wire-up: include user_id when the user is logged in so
        // the backend can route to the personalized path. Frontend currently
        // sends the 2-char MBTI group only — the lazy profile-create on the
        // backend requires the 4-char form (INTJ/ENFP/...) which a separate
        // round will collect via an MBTI quiz. Until then, all calls land
        // on the cold path (Phase 2.5 selection feed unchanged), but
        // user_interactions still accumulates from ArticleView so the
        // Consolidation Lambda has data ready when profiles arrive.
        // Round 5-G: prefer the 4-char MBTI from localStorage when present —
        // backend's _extract_full_mbti recognizes it and triggers the lazy
        // profile-create / EWMA path. Fall back to the 2-char selectedGroup
        // for users whose localStorage hasn't been migrated yet (the
        // backfill in app/page.tsx covers them on next mount, but the
        // first feed call after R5-G deploy may still fire with group only).
        const mbtiParam = (typeof window !== "undefined"
          ? localStorage.getItem("mbti-type")
          : null) || selectedGroup;
        const userIdParam = user?.userId
          ? `&user_id=${encodeURIComponent(user.userId)}`
          : "";
        const url = `${API_URL}/api/v2/feed?mbti=${mbtiParam}&limit=30${userIdParam}`;
        const res = await fetch(url);
        if (!res.ok) {
          console.warn(`v2 feed returned ${res.status} — falling back to mock`);
          const fallback = mockArticles as unknown as Article[];
          articleListCache.set(cacheKey, fallback);
          setArticles(fallback);
          return;
        }
        const data = await res.json();
        const items = Array.isArray(data?.items) ? data.items : [];
        let mapped: Article[];
        if (items.length === 0) {
          console.info('v2 feed returned 0 items — using mock for UI preview');
          mapped = mockArticles as unknown as Article[];
        } else {
          mapped = items.map(adaptV2FeedItem);
        }
        articleListCache.set(cacheKey, mapped);
        setArticles(mapped);
      } catch (err) {
        console.warn('v2 feed fetch failed — falling back to mock', err);
        setArticles(mockArticles as unknown as Article[]);
      } finally {
        setLoading(false);
      }
    }
    fetchArticles();
  }, [selectedDate, selectedGroup, user?.userId]);

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

  // 문장 아카이빙 — logged-in: server API, anonymous: local state
  const archiveSentence = async (text: string, articleId: string, articleTitle: string, articlePublishedAt?: string) => {
    const newSentence: ArchivedSentence = {
      id: `${articleId}-${Date.now()}`,
      text,
      articleId,
      articleTitle,
      articlePublishedAt,
      createdAt: new Date(),
    };

    // Optimistic: add to local state immediately
    setArchivedSentences(prev => [newSentence, ...prev]);

    // If logged in, also save to server
    if (user?.userId) {
      try {
        const { saveArchiveSentence } = await import('@/shared/lib/archiveApi');
        const result = await saveArchiveSentence({
          user_id: user.userId,
          text,
          article_id: articleId,
          article_title: articleTitle,
          article_published_at: articlePublishedAt,
        });
        // Replace local ID with server ID
        setArchivedSentences(prev =>
          prev.map(s => s.id === newSentence.id
            ? { ...s, id: result.sentence.id, createdAt: new Date(result.sentence.created_at) }
            : s
          )
        );
      } catch (err) {
        console.warn('Server archive save failed (local save kept):', err);
      }
    }
  };

  const currentQuestion = activeQuestionsList[Math.min(currentQuestionIndex, activeQuestionsList.length - 1)];

  // 뉴스 DNA 데이터 (예시)
  const newsDNA = {
    economy: 75,
    tech: 60,
    world: 40,
    society: 30,
    culture: 20,
    politics: 45,
  };

  return (
    <div className="min-h-screen bg-[#F8F9FA] flex flex-col">
      {/* Header - 1단 통합 */}
      <Header
        onLogo={() => setActiveTab("feed")}
        onSearch={() => setShowSearch(true)}
        tabs={[
          // 전체 레터 모음(/letters)으로 실제 이동 — 예전엔 in-page 탭 전환(버튼)이라
          // 눌러도 화면이 안 바뀌는 것처럼 보였다. 홈 피드로 돌아오는 길은 로고 클릭
          // (onLogo → setActiveTab("feed"))으로 그대로 유지.
          { key: "feed", label: "레터", href: "/letters" },
          // '내 서랍' 탭 제거(2026-08-06, headerTabs.ts 주석 참조) — 페이지/저장
          // 기능 자체는 살아있고 activeTab === "archive" 렌더 분기도 그대로 둔다.
          // 탭이 많아 보인다는 피드백(2026-08-06) — 드롭다운 대신 tier:'extra'로
          // 무게만 낮춰 "본체 vs 덤" 구분(headerTabs.ts와 동일 원칙, 상세 주석 참조).
          // '에디터' 탭 제거(2026-08-06) — 페이지/구독 펀널은 그대로 살아있고
          // 온보딩 플로우에서 계속 링크된다(headerTabs.ts 주석 참조).
          { key: "fortune", label: "사주", href: "/fortune", tier: "extra" },
          { key: "timeline", label: "타임라인", href: TIMELINE_HREF, tier: "extra" },
          { key: "games", label: "게임", href: "/games", tier: "extra" },
          { key: "webtoon", label: "웹툰", href: "/webtoon", tier: "extra" },
        ]}
      />

      <SmartSearchOverlay open={showSearch} onClose={() => setShowSearch(false)} />

      {/* 메인 콘텐츠 */}
      <style>{`
        @keyframes tabFadeIn {
          0% { opacity: 0; transform: translateY(6px); }
          100% { opacity: 1; transform: translateY(0); }
        }
        .tab-fade-in { animation: tabFadeIn 0.25s ease-out both; }
      `}</style>
      <main className="flex-1">
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
            articles={articles}
            loading={loading}
            selectedGroup={selectedGroup}
            onMbtiChange={onMbtiChange}
            onArticleClick={openArticle}
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
            articles={articles}
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

      {/* Article View */}
      {viewArticle && (
        <ArticleView
          article={viewArticle}
          currentGroup={selectedGroup}
          onClose={handleCloseArticle}
          onChangeGroup={() => {}}
          onArchiveSentence={archiveSentence}
        />
      )}

    </div>
  );
}
