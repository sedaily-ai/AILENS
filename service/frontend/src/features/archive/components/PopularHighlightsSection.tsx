'use client';

import { useState, useEffect } from 'react';
import { fetchPopularArchiveSentences, type PopularHighlight } from '@/shared/lib/api/archiveApi';

// ── 다른 사람들이 담은 문장 ──
// 능동적 글쓰기(댓글·공유 글쓰기)가 필요한 커뮤니티 대신, 문장 저장이라는 저비용 행동만으로 채워지는 집계 피드이다(Kindle Popular Highlights와 같은 패턴). 사용자 식별 정보는 노출하지 않는다.
export function PopularHighlightsSection() {
  const [highlights, setHighlights] = useState<PopularHighlight[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchPopularArchiveSentences(12)
      .then((data) => {
        if (!cancelled) setHighlights(data);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // 표본이 작아 집계 결과가 없으면(모두 1건뿐) 조용히 숨기고 가짜로 채우지 않는다.
  if (!loading && highlights.length === 0) return null;

  return (
    <div className="mb-12">
      <div className="flex items-center gap-3 mb-5">
        <div className="w-9 h-9 bg-indigo-50 rounded-xl flex items-center justify-center flex-shrink-0">
          <svg className="w-[18px] h-[18px] text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 20h5v-2a4 4 0 00-3-3.87M9 20H4v-2a4 4 0 013-3.87m6-1.13a4 4 0 100-8 4 4 0 000 8zm6 0a4 4 0 100-8 4 4 0 000 8z" />
          </svg>
        </div>
        <div>
          <p className="text-[14px] font-bold text-gray-900">다른 사람들이 담은 문장</p>
          <p className="text-[11px] text-gray-400">여러 사람이 같이 눈여겨본 문장이에요</p>
        </div>
      </div>

      {loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <div key={i} className="bg-gray-100 rounded-2xl h-[72px]" />
          ))}
        </div>
      ) : (
        <div className="space-y-2">
          {highlights.map((h, idx) => (
            <div key={`${h.article_id}-${idx}`} className="p-4 bg-gray-50 rounded-2xl">
              <p className="text-[14px] text-gray-800 leading-relaxed line-clamp-2 mb-2">&quot;{h.text}&quot;</p>
              <div className="flex items-center justify-between gap-3">
                <span className="text-[11px] text-gray-400 truncate">{h.article_title}</span>
                <span className="text-[11px] text-indigo-500 font-semibold flex-shrink-0">{h.count}명이 담았어요</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
