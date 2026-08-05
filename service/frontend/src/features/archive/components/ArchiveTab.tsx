'use client';

import { useState, useEffect, useCallback, useMemo } from "react";
import type { ArchivedSentence, MbtiArticle, TabType } from "@/shared/types/mbti";
import { getWeekDays, isSameDay, getMonthDays } from "@/shared/utils/dateUtils";
import { useAuth } from "@/features/auth";
import {
  listArchiveSentences,
  deleteArchiveSentence,
  searchSimilarSentences,
  searchArticlesByKeywords,
  type ArchiveSentenceResponse,
  type SimilarSentence,
  type KeywordArticle,
} from "@/shared/lib/archiveApi";

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

  // Loading/error state
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Similarity search state
  const [similarResults, setSimilarResults] = useState<SimilarSentence[]>([]);
  const [similarLoading, setSimilarLoading] = useState(false);
  const [similarSentenceId, setSimilarSentenceId] = useState<string | null>(null);

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

  // ── Delete handler ────────────────────────────────────────────────────
  const handleDelete = useCallback(async (sentence: ArchivedSentence) => {
    setDeletingId(sentence.id);

    // Optimistic: remove from local state immediately
    setArchivedSentences(prev => prev.filter(s => s.id !== sentence.id));

    // If logged in, also delete from server
    if (isAuthenticated && user?.userId) {
      try {
        await deleteArchiveSentence(sentence.id, user.userId);
      } catch (err) {
        console.warn('Server delete failed (local delete kept):', err);
        // Don't roll back — local state is source of truth for UX
      }
    }

    setDeletingId(null);
  }, [isAuthenticated, user?.userId, setArchivedSentences]);

  // ── Similarity search handler ─────────────────────────────────────────
  const handleSimilarSearch = useCallback(async (sentence: ArchivedSentence) => {
    if (!isAuthenticated || !user?.userId) return;

    // Toggle: if already showing for this sentence, close
    if (similarSentenceId === sentence.id) {
      setSimilarSentenceId(null);
      setSimilarResults([]);
      return;
    }

    setSimilarSentenceId(sentence.id);
    setSimilarLoading(true);
    setSimilarResults([]);

    try {
      const result = await searchSimilarSentences(user.userId, sentence.text, 5);
      if (result) {
        setSimilarResults(result.similar_sentences);
      } else {
        // null = pgvector not configured
        setSimilarResults([]);
      }
    } catch (err) {
      console.warn('Similarity search failed:', err);
      setSimilarResults([]);
    } finally {
      setSimilarLoading(false);
    }
  }, [isAuthenticated, user?.userId, similarSentenceId]);

  return (
    <div className="min-h-[calc(100vh-120px)] bg-white">

      {/* 비로그인 CTA — 페이지 구조는 그대로 보여주고, 가장 위에 가입 유도. */}
      {!isAuthenticated && <ArchiveLoginCta />}

      {/* 날짜 네비 — 문장이 있을 때만 */}
      {archivedSentences.length > 0 && (
        <div className="sticky top-0 z-30 bg-white/98 backdrop-blur-md shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
          <div className="flex items-center justify-center gap-4 py-3 px-4">
            <button
              onClick={() => {
                const d = new Date(archiveDate);
                d.setDate(d.getDate() - 7);
                setArchiveDate(d);
              }}
              className="p-2 hover:bg-gray-50 rounded-full transition-colors"
            >
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <button
              onClick={() => setShowCalendar?.(true)}
              className="flex items-center gap-1.5 text-[15px] font-semibold text-gray-900 hover:text-gray-600 transition-colors"
            >
              {archiveDate.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' })}
              <svg className="w-3.5 h-3.5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            <button
              onClick={() => {
                const d = new Date(archiveDate);
                d.setDate(d.getDate() + 7);
                if (d <= new Date()) setArchiveDate(d);
              }}
              className="p-2 hover:bg-gray-50 rounded-full transition-colors"
            >
              <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>
          </div>

          <div className="flex justify-center gap-1 px-4 pb-3">
            {getWeekDays(archiveDate).map((day) => {
              const isSelected = isSameDay(day, archiveDate);
              const isToday = isSameDay(day, new Date());
              const isFuture = day > new Date();
              const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
              const count = archivedSentences.filter(s => isSameDay(new Date(s.createdAt), day)).length;

              return (
                <button
                  key={day.toISOString()}
                  onClick={() => !isFuture && setArchiveDate(day)}
                  disabled={isFuture}
                  className={`relative flex flex-col items-center px-3 py-2 rounded-xl transition-all duration-200 min-w-[48px] ${
                    isSelected
                      ? "bg-blue-500 text-white shadow-sm"
                      : isToday
                        ? "bg-gray-100 text-gray-900 font-semibold"
                        : isFuture
                          ? "text-gray-300 cursor-not-allowed"
                          : "text-gray-500 hover:bg-gray-50"
                  }`}
                >
                  <span className="text-[11px] mb-1">{dayNames[day.getDay()]}</span>
                  <span className="text-[16px] font-medium">{day.getDate()}</span>
                  {count > 0 && !isSelected && (
                    <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-amber-400 text-white text-[9px] font-bold rounded-full flex items-center justify-center">
                      {count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* 캘린더 팝업 */}
      {showArchiveCalendar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50" onClick={() => setShowArchiveCalendar(false)}>
          <div className="bg-white rounded-2xl shadow-2xl p-6 w-[340px]" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={() => setArchiveCalendarMonth(new Date(archiveCalendarMonth.getFullYear(), archiveCalendarMonth.getMonth() - 1))}
                className="p-2 hover:bg-gray-100 rounded-full"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <span className="text-[18px] font-bold">
                {archiveCalendarMonth.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long' })}
              </span>
              <button
                onClick={() => setArchiveCalendarMonth(new Date(archiveCalendarMonth.getFullYear(), archiveCalendarMonth.getMonth() + 1))}
                className="p-2 hover:bg-gray-100 rounded-full"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>

            <div className="grid grid-cols-7 gap-1 mb-2">
              {['월', '화', '수', '목', '금', '토', '일'].map((d) => (
                <div key={d} className="text-center text-[12px] text-gray-400 py-2">{d}</div>
              ))}
            </div>

            <div className="grid grid-cols-7 gap-1">
              {getMonthDays(archiveCalendarMonth.getFullYear(), archiveCalendarMonth.getMonth()).map((day, idx) => {
                if (!day) return <div key={idx} />;
                const isSelected = archiveDate && isSameDay(day, archiveDate);
                const isToday = isSameDay(day, new Date());
                const isFuture = day > new Date();
                const hasSentences = archivedSentences.some(s => isSameDay(new Date(s.createdAt), day));

                return (
                  <button
                    key={idx}
                    onClick={() => {
                      if (!isFuture) {
                        setArchiveDate(day);
                        setShowArchiveCalendar(false);
                      }
                    }}
                    disabled={isFuture}
                    className={`aspect-square flex flex-col items-center justify-center rounded-full text-[14px] transition-all relative ${
                      isSelected
                        ? "bg-blue-500 text-white font-bold"
                        : isToday
                          ? "bg-gray-200 text-gray-900 font-semibold"
                          : isFuture
                            ? "text-gray-300 cursor-not-allowed"
                            : "text-gray-700 hover:bg-gray-100"
                    }`}
                  >
                    {day.getDate()}
                    {hasSentences && !isSelected && (
                      <span className="absolute bottom-1 w-1 h-1 bg-amber-400 rounded-full" />
                    )}
                  </button>
                );
              })}
            </div>

            <button
              onClick={() => {
                setArchiveDate(new Date());
                setShowArchiveCalendar(false);
              }}
              className="w-full mt-4 py-3 bg-blue-500 text-white rounded-xl font-medium hover:bg-blue-600 transition-colors"
            >
              오늘로 이동
            </button>
          </div>
        </div>
      )}

      <div className="max-w-[600px] mx-auto px-6 py-10">

        {/* Loading skeleton */}
        {isLoading && (
          <div className="space-y-4 animate-pulse">
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
                {filteredSentences.map((sentence, idx) => {
                  const timeStr = new Date(sentence.createdAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' });
                  const isCopied = copiedId === sentence.id;

                  return (
                    <div
                      key={sentence.id}
                      className="group rounded-2xl bg-gray-50 hover:bg-white hover:shadow-[0_2px_12px_rgba(0,0,0,0.06)] transition-all duration-300"
                      style={{ animation: `fadeIn 0.4s ease-out ${idx * 0.05}s both` }}
                    >
                      <style>{`@keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }`}</style>
                      <div className="p-5">
                        {/* 문장 */}
                        <div className="flex gap-3">
                          <div className="w-0.5 bg-amber-300 rounded-full flex-shrink-0 mt-1" style={{ minHeight: '20px' }} />
                          <p className="text-[16px] text-gray-800 leading-[1.9] flex-1">{sentence.text}</p>
                        </div>

                        {/* 출처 + 액션 */}
                        <div className="flex items-center justify-between mt-4 pl-3.5">
                          <button
                            onClick={() => {
                              const article = articles.find(a => a.news_id === sentence.articleId);
                              if (article) {
                                setActiveTab("feed");
                                setTimeout(() => {
                                  setExpandedArticles(prev => new Set(prev).add(sentence.articleId));
                                }, 100);
                              }
                            }}
                            className="flex items-center gap-1.5 text-[13px] text-gray-500 hover:text-blue-500 transition-colors max-w-[60%] truncate"
                          >
                            <svg className="w-3.5 h-3.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                            </svg>
                            <span className="truncate">{sentence.articleTitle}</span>
                          </button>

                          <div className="flex items-center gap-1">
                            <span className="text-[11px] text-gray-300 mr-1">{timeStr}</span>
                            <button
                              onClick={() => handleCopy(sentence)}
                              className={`p-1.5 rounded-lg transition-all duration-200 ${isCopied ? 'bg-blue-50 text-blue-500' : 'opacity-0 group-hover:opacity-100 hover:bg-gray-100 text-gray-400'}`}
                              title="복사"
                            >
                              {isCopied ? (
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                                </svg>
                              ) : (
                                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                                </svg>
                              )}
                            </button>
                            <button
                              onClick={() => setArchivedSentences(prev => prev.filter(s => s.id !== sentence.id))}
                              className="p-1.5 rounded-lg opacity-0 group-hover:opacity-100 hover:bg-rose-50 text-gray-400 hover:text-rose-400 transition-all duration-200"
                              title="삭제"
                            >
                              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
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

// ── 관심사 기반 추천 ──────────────────────────────────────────────
// 저장한 문장 텍스트 → 토큰화 + stopword 제거 + 빈도 정렬 → top 20 키워드 추출
// → 기사 title/카테고리에 키워드 hit 카운트 → 점수 desc + 최신순 정렬
// 초기 3개, "더보기" 누를 때마다 +3 노출.
const KO_STOPWORDS = new Set([
  '은', '는', '이', '가', '을', '를', '에', '의', '와', '과', '도', '로', '으로', '에서',
  '한', '있', '없', '되', '것', '수', '등', '및', '안', '내', '뿐', '저', '나', '너',
  '우리', '그', '저것', '이것', '저런', '이런', '하다', '있다', '없다', '되다', '그리고',
  '그러나', '하지만', '또는', '또', '거예요', '입니다', '했어요', '었어요', '거든요',
  '점이', '대해', '관련', '경우', '때문', '으로서', '에게', '한테', '에는', '으론',
  '면서', '이라', '라는', '이며', '이고', '입', '있을', '없을', '같은', '같다',
]);

function extractKeywords(sentences: ArchivedSentence[], topN: number = 20): string[] {
  const text = sentences.map((s) => s.text).join(' ');
  const tokens = text
    .replace(/[^\w가-힯ㄱ-ㆎ\s]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t.length >= 2 && !KO_STOPWORDS.has(t));
  const freq: Record<string, number> = {};
  for (const t of tokens) freq[t] = (freq[t] || 0) + 1;
  return Object.entries(freq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([t]) => t);
}

function ArchiveRecommendations({
  archivedSentences,
}: {
  archivedSentences: ArchivedSentence[];
}) {
  const [visibleCount, setVisibleCount] = useState(3);
  const [results, setResults] = useState<KeywordArticle[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fetchedKeywords, setFetchedKeywords] = useState<string[]>([]);

  const keywords = useMemo(() => extractKeywords(archivedSentences), [archivedSentences]);
  const archivedIds = useMemo(
    () => new Set(archivedSentences.map((s) => s.articleId)),
    [archivedSentences],
  );

  // 키워드 변경 시 백엔드 호출 — XML 버킷에서 최근 7일분 매칭 검색.
  useEffect(() => {
    if (keywords.length === 0) {
      setResults([]);
      setFetchedKeywords([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    searchArticlesByKeywords(keywords.slice(0, 12), { days: 7, limit: 24 })
      .then((res) => {
        if (cancelled) return;
        // 이미 서랍에 담은 기사는 제외
        setResults(res.articles.filter((a) => !archivedIds.has(a.news_id)));
        setFetchedKeywords(res.keywords || keywords);
        setVisibleCount(3); // 키워드 바뀌면 초기화
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : '검색 실패');
        setResults([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [keywords, archivedIds]);

  if (archivedSentences.length === 0) return null;
  if (!loading && results.length === 0 && !error) return null;

  const visible = results.slice(0, visibleCount);
  const hasMore = results.length > visibleCount;
  const maxMatches = results[0]?.matches || 1;

  return (
    <div className="mt-14">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-9 h-9 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0">
          <svg className="w-[18px] h-[18px] text-blue-600" viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2l2.4 7.2L22 12l-7.6 2.8L12 22l-2.4-7.2L2 12l7.6-2.8L12 2z" />
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[14px] font-bold text-gray-900">관심사 기반 추천</p>
          <p className="text-[11px] text-gray-400 truncate">
            저장한 문장 키워드로 최근 7일 기사 매칭 ·{' '}
            {(fetchedKeywords.length ? fetchedKeywords : keywords).slice(0, 4).map((k) => `#${k}`).join(' ')}
          </p>
        </div>
      </div>

      {loading && (
        <div className="py-8 text-center text-[12.5px] text-gray-400">
          뉴스 매칭 중…
        </div>
      )}

      {!loading && error && (
        <div className="py-6 text-center text-[12.5px] text-amber-600">
          추천을 불러오지 못했어요 · {error}
        </div>
      )}

      {!loading && !error && (
        <>
          <div className="space-y-2">
            {visible.map((article) => {
              const pct = Math.round(60 + (article.matches / maxMatches) * 38);
              const href = article.original_link || '#';
              return (
                <a
                  key={article.news_id}
                  href={href}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="block w-full text-left p-4 bg-gray-50 hover:bg-white hover:shadow-[0_2px_12px_rgba(0,0,0,0.06)] rounded-2xl transition-all duration-300 group/rec"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-blue-50 rounded-xl flex items-center justify-center flex-shrink-0">
                      <span className="text-[13px] font-bold text-blue-600 tabular-nums">{pct}%</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-[14px] font-medium text-gray-800 line-clamp-1 group-hover/rec:text-blue-700 transition-colors">
                        {article.title}
                      </p>
                      <p className="text-[11px] text-gray-400 mt-0.5">
                        {article.category} · 키워드 {article.matches}개 매칭 ·{' '}
                        {new Date(article.published_at).toLocaleDateString('ko-KR', {
                          month: 'long',
                          day: 'numeric',
                        })}
                      </p>
                    </div>
                    <svg className="w-4 h-4 text-gray-300 group-hover/rec:text-blue-500 transition-colors flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </a>
              );
            })}
          </div>

          {hasMore && (
            <div className="mt-4 text-center">
              <button
                type="button"
                onClick={() => setVisibleCount((c) => c + 3)}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-[13px] font-medium text-gray-700 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
              >
                더보기 <span className="text-gray-400">+3</span>
              </button>
            </div>
          )}

          {!hasMore && results.length > 3 && (
            <p className="mt-4 text-center text-[11.5px] text-gray-400">
              매칭된 {results.length}개 기사를 모두 보고 있어요
            </p>
          )}
        </>
      )}
    </div>
  );
}

// ── 비로그인 시 상단 CTA 배너 ─────────────────────────────────────────
// 메인 페이지 톤 — white bg + gray-200 border + blue primary CTA.
function ArchiveLoginCta() {
  return (
    <div className="max-w-[640px] mx-auto px-5 pt-6">
      <div className="rounded-2xl border border-gray-200 bg-white px-6 py-7 sm:px-8 sm:py-8">
        <p className="text-[10.5px] font-bold tracking-[0.22em] text-blue-600 uppercase">
          My Drawer
        </p>
        <h3
          className="mt-2 text-[20px] sm:text-[22px] font-bold text-gray-900 tracking-tight leading-snug"
          style={{ fontFamily: 'Noto Serif KR, Georgia, serif' }}
        >
          관심 있는 문장을
          <br />
          레터를 읽다가 서랍에 담아두세요
        </h3>
        <p className="mt-3 text-[13.5px] text-gray-500 leading-relaxed">
          담아둔 문장과 결이 닿는 뉴스 기사를 추천해드려요.
          <br />
          기기를 바꿔도 같은 서랍이 따라옵니다.
        </p>
        <a
          href="/login"
          className="mt-6 inline-flex items-center justify-center px-5 py-2.5 text-[13.5px] font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors"
        >
          로그인 / 가입하기
          <span aria-hidden className="ml-1.5">→</span>
        </a>
        <p className="mt-5 text-[11.5px] text-gray-400 leading-relaxed">
          비로그인 상태에선 페이지 구조만 미리 보여드려요 · 문장 저장은 로그인 후
        </p>
      </div>
    </div>
  );
}
