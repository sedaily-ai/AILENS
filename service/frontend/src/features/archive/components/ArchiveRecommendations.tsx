'use client';

import { useState, useEffect, useMemo } from 'react';
import type { ArchivedSentence } from '@/shared/types/mbti';
import { searchArticlesByKeywords, type KeywordArticle } from '@/shared/lib/archiveApi';

// ── 관심사 기반 추천 ──────────────────────────────────────────────
// 저장한 문장 텍스트 → 토큰화 + stopword 제거 + 빈도 정렬 → top 20 키워드 추출
// → 기사 title/카테고리에 키워드 hit 카운트 → 점수 desc + 최신순 정렬
// 초기 3개, "더보기" 누를 때마다 +3 노출.
// ArchiveTab.tsx(893줄)가 너무 길어서 다른 독립 서브컴포넌트들과 함께
// 분리했다(2026-08-18).
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

export function ArchiveRecommendations({
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
