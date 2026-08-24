'use client';

import { useState, useEffect } from "react";
import type { ArchivedSentence, MbtiArticle, TabType } from "@/shared/types/mbti";
import { isSameDay } from "@/shared/utils/dateUtils";
import { useAuth } from "@/entities/user";
import {
  listArchiveSentences,
  deleteArchiveSentence,
  type ArchiveSentenceResponse,
} from "@/shared/lib/api/archiveApi";
import { ArchiveLoginCta } from './ArchiveLoginCta';
import { ArchiveDateNav } from './ArchiveDateNav';
import { ArchiveCalendarModal } from './ArchiveCalendarModal';
import { SentenceCard } from './SentenceCard';
import { TodaysSentenceSection } from './TodaysSentenceSection';
import { PopularHighlightsSection } from './PopularHighlightsSection';
import { ArchiveRecommendations } from './ArchiveRecommendations';

type Article = MbtiArticle;

interface Props {
  archiveDate: Date;
  setArchiveDate: (date: Date) => void;
  archivedSentences: ArchivedSentence[];
  setArchivedSentences: React.Dispatch<React.SetStateAction<ArchivedSentence[]>>;
  setActiveTab: (tab: TabType) => void;
  setExpandedArticles: React.Dispatch<React.SetStateAction<Set<string>>>;
  articles: Article[];
  showToast: () => void;
  setShowCalendar?: (show: boolean) => void;
}

/** Convert server response to frontend ArchivedSentence type */
function toFrontendSentence(s: ArchiveSentenceResponse): ArchivedSentence {
  return {
    id: s.id,
    text: s.text,
    articleId: s.article_id,
    articleTitle: s.article_title,
    articlePublishedAt: s.article_published_at,
    createdAt: new Date(s.created_at),
  };
}

// 2026-08-18: 893줄이던 이 파일을 쪼갰다 — ArchiveLoginCta/TodaysSentenceSection/
// PopularHighlightsSection/ArchiveRecommendations는 이미 완전히 독립적인
// 서브컴포넌트로 같은 파일 안에 살고 있던 걸 각자 파일로 옮겼고, 날짜 네비
// 스트립·캘린더 팝업·서랍 문장 카드는 인라인 JSX 덩어리(각 80줄 안팎)라
// 새로 컴포넌트로 뽑아냈다(ArchiveDateNav/ArchiveCalendarModal/SentenceCard).
// 로직·마크업은 그대로 — 구조만 옮겼다.
//
// 이 과정에서 handleSimilarSearch/similarResults/similarLoading/
// similarSentenceId(문장 유사도 검색 — pgvector 기반)가 렌더 어디서도 안 쓰이는
// 완전한 죽은 코드라 같이 정리했다. handleDelete/deletingId는 다른 문제라
// 그대로 남겨뒀다 — 아래 handleDelete 주석 참조.
export function ArchiveTab({
  archiveDate,
  setArchiveDate,
  archivedSentences,
  setArchivedSentences,
  setActiveTab,
  setExpandedArticles,
  articles,
  showToast,
  setShowCalendar,
}: Props) {
  const { user, isAuthenticated } = useAuth();
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // UI state
  const [showArchiveCalendar, setShowArchiveCalendar] = useState(false);
  const [archiveCalendarMonth, setArchiveCalendarMonth] = useState<Date>(new Date());

  const filteredSentences = archivedSentences.filter(s => isSameDay(new Date(s.createdAt), archiveDate));

  const handleCopy = (sentence: ArchivedSentence) => {
    navigator.clipboard.writeText(`"${sentence.text}"\n— ${sentence.articleTitle}`);
    setCopiedId(sentence.id);
    showToast();
    setTimeout(() => setCopiedId(null), 1500);
  };

  // 삭제 버튼이 로컬 state만 지우고 서버엔 요청을 보낸 적이 없어서, 새로고침하면
  // "삭제한" 문장이 되살아났다(2026-08-24, 사용자 지적) — 낙관적으로 먼저 지우고
  // 실제 DELETE 호출, 실패하면 되돌린다.
  const handleDelete = async (sentence: ArchivedSentence) => {
    setArchivedSentences(prev => prev.filter(s => s.id !== sentence.id));
    if (!isAuthenticated || !user?.userId) return;
    try {
      await deleteArchiveSentence(sentence.id, user.userId);
    } catch (err) {
      console.warn('Archive delete failed, restoring:', err);
      setArchivedSentences(prev => [...prev, sentence]);
      setError('삭제에 실패했어요. 다시 시도해주세요.');
    }
  };

  // Loading/error state
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Load from server on mount (logged-in users) ───────────────────────
  useEffect(() => {
    if (!isAuthenticated || !user?.userId) return;

    let cancelled = false;

    async function loadFromServer() {
      setIsLoading(true);
      setError(null);
      try {
        const data = await listArchiveSentences(user!.userId);
        if (!cancelled) {
          const serverSentences = data.sentences.map(toFrontendSentence);
          setArchivedSentences(serverSentences);
        }
      } catch (err) {
        if (!cancelled) {
          console.warn('Archive API unavailable, keeping local data:', err);
          // Keep existing local data as fallback
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    loadFromServer();
    return () => { cancelled = true; };
  }, [isAuthenticated, user?.userId, setArchivedSentences]);

  return (
    <div className="min-h-[calc(100vh-120px)] bg-white">

      {/* 비로그인 CTA — 페이지 구조는 그대로 보여주고, 가장 위에 가입 유도. */}
      {!isAuthenticated && <ArchiveLoginCta />}

      {/* 날짜 네비 — 문장이 있을 때만 */}
      {archivedSentences.length > 0 && (
        <ArchiveDateNav
          archiveDate={archiveDate}
          setArchiveDate={setArchiveDate}
          archivedSentences={archivedSentences}
          onOpenCalendar={() => setShowCalendar?.(true)}
        />
      )}

      {/* 캘린더 팝업 */}
      <ArchiveCalendarModal
        open={showArchiveCalendar}
        onClose={() => setShowArchiveCalendar(false)}
        archiveDate={archiveDate}
        setArchiveDate={setArchiveDate}
        archivedSentences={archivedSentences}
        calendarMonth={archiveCalendarMonth}
        setCalendarMonth={setArchiveCalendarMonth}
      />

      <div className="max-w-[600px] mx-auto px-6 py-10">

        {/* 오늘의 한 문장 — "다른 사람들이 담은 문장"은 실사용자가 쌓여야
            나타나므로, 서비스 초기엔 그마저도 비어있을 수 있다(2026-08-06
            논의). 매일 실제로 발행되는 레터에서 자동으로 뽑아 항상 채워지는
            층을 하나 더 둔다 — 누가 골라줄 필요 없이 오늘자 레터가 있으면
            무조건 뜬다. 가짜 데이터 아님: 오늘 실제로 나간 문장 그대로. */}
        <TodaysSentenceSection />

        {/* 다른 사람들이 담은 문장 — 커뮤니티 탭(글쓰기 필요) 대체(2026-08-06).
            로그인/보관 여부와 무관하게 항상 먼저 보여준다 — 빈 서랍일 때도
            "다들 이런 걸 저장하는구나"가 첫 저장의 동기가 되도록. */}
        <PopularHighlightsSection />

        {/* Loading placeholder */}
        {isLoading && (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-gray-100 rounded-2xl h-28" />
            ))}
          </div>
        )}

        {/* Error message */}
        {error && (
          <div className="mb-6 p-4 bg-red-50 text-red-600 rounded-xl text-[14px]">
            {error}
            <button onClick={() => setError(null)} className="ml-2 underline">닫기</button>
          </div>
        )}

        {!isLoading && archivedSentences.length === 0 ? (
          /* ── 빈 상태 ── */
          <div className="text-center py-24">
            <div className="relative w-20 h-20 mx-auto mb-8" style={{ animation: 'float 4s ease-in-out infinite' }}>
              <style>{`
                @keyframes float { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-8px); } }
              `}</style>
              <div className="absolute inset-0 bg-amber-100/40 rounded-2xl rotate-6" />
              <div className="absolute inset-0 bg-white rounded-2xl shadow-sm flex items-center justify-center">
                <svg className="w-9 h-9 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                </svg>
              </div>
            </div>

            <h2 className="text-[22px] font-bold text-gray-900 mb-2">아직 비어있는 서랍</h2>
            <p className="text-[14px] text-gray-500 leading-relaxed mb-10">
              뉴스를 읽다 마음에 남는 문장이 있다면<br/>클릭해서 이곳에 보관해보세요
            </p>

            <button
              onClick={() => setActiveTab("feed")}
              className="group px-8 py-3.5 bg-gray-900 text-white rounded-full text-[14px] font-medium hover:bg-gray-800 transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5 active:scale-[0.97]"
            >
              <span className="flex items-center gap-2">
                오늘의 뉴스 읽기
                <svg className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </span>
            </button>
          </div>
        ) : !isLoading && (
          <>
            {/* ── 헤더 ── */}
            <div className="flex items-center justify-between mb-8">
              <div>
                <p className="text-[13px] text-amber-600 font-medium mb-1">
                  {archivedSentences.length === 1 ? '첫 번째 문장을 저장했어요' :
                   archivedSentences.length < 5 ? '컬렉션이 시작되었어요' :
                   archivedSentences.length < 10 ? '멋진 컬렉션이 만들어지고 있어요' :
                   '당신만의 인사이트가 쌓이고 있어요'}
                </p>
                <h2 className="text-[24px] font-black text-gray-900 tabular-nums">
                  {archivedSentences.length}<span className="text-[16px] font-medium text-gray-400 ml-1">개의 문장</span>
                </h2>
                {isAuthenticated && (
                  <p className="text-[12px] text-gray-400 mt-1">서버에 동기화됨</p>
                )}
              </div>
              <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center">
                <svg className="w-6 h-6 text-amber-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
                </svg>
              </div>
            </div>

            {/* ── 회상 카드 ── */}
            {archivedSentences.length >= 2 && (
              <div className="mb-10 p-6 bg-amber-50/60 rounded-2xl">
                <p className="text-[11px] text-amber-600/80 font-semibold tracking-wider uppercase mb-3">Flashback</p>
                <p className="text-[17px] text-gray-800 leading-[1.8] font-medium">
                  &quot;{archivedSentences[Math.floor(Math.random() * archivedSentences.length)]?.text.slice(0, 100)}{archivedSentences[0]?.text.length > 100 ? '...' : ''}&quot;
                </p>
              </div>
            )}

            {/* ── 날짜 구분 ── */}
            <div className="flex items-center gap-3 mb-6">
              <div className="w-8 h-8 bg-gray-50 rounded-lg flex items-center justify-center flex-shrink-0">
                <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
              </div>
              <span className="text-[14px] font-semibold text-gray-900">
                {archiveDate.toLocaleDateString('ko-KR', { month: 'long', day: 'numeric', weekday: 'long' })}
              </span>
              <div className="flex-1 h-px bg-gray-100" />
              <span className="text-[12px] text-gray-400 tabular-nums">{filteredSentences.length}개</span>
            </div>

            {/* ── 문장 목록 ── */}
            {filteredSentences.length === 0 ? (
              <div className="text-center py-16">
                <div className="w-14 h-14 mx-auto mb-4 bg-gray-50 rounded-2xl flex items-center justify-center">
                  <svg className="w-6 h-6 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-2.586a1 1 0 00-.707.293l-2.414 2.414a1 1 0 01-.707.293h-3.172a1 1 0 01-.707-.293l-2.414-2.414A1 1 0 006.586 13H4" />
                  </svg>
                </div>
                <p className="text-[15px] text-gray-500 mb-1">이 날은 비어있어요</p>
                <p className="text-[13px] text-gray-400">다른 날짜를 선택해보세요</p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredSentences.map((sentence, idx) => (
                  <SentenceCard
                    key={sentence.id}
                    sentence={sentence}
                    index={idx}
                    isCopied={copiedId === sentence.id}
                    onCopy={() => handleCopy(sentence)}
                    onDelete={() => handleDelete(sentence)}
                    onNavigate={() => {
                      const article = articles.find(a => a.news_id === sentence.articleId);
                      if (article) {
                        setActiveTab("feed");
                        setTimeout(() => {
                          setExpandedArticles(prev => new Set(prev).add(sentence.articleId));
                        }, 100);
                      }
                    }}
                  />
                ))}
              </div>
            )}

            {/* ── 관심사 기반 추천 — XML 버킷 raw 기사 키워드 매칭 ── */}
            <ArchiveRecommendations archivedSentences={archivedSentences} />

            {/* ── 하단 CTA ── */}
            <div className="mt-16 text-center pb-8">
              <button
                onClick={() => setActiveTab("feed")}
                className="text-[13px] text-gray-400 hover:text-gray-600 transition-colors"
              >
                뉴스피드로 돌아가기 →
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
