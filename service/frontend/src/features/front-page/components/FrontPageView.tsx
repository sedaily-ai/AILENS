'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  fetchFrontPage,
  type FrontPageArticle,
  type FrontPageResponse,
} from '../api/frontPageApi';
import { formatPaperDate, prevDay } from '../lib/dateLabels';

type LoadState =
  | { phase: 'loading' }
  | { phase: 'error' }
  | { phase: 'ready'; data: FrontPageResponse };

function ArticleCard({
  article,
  onOpen,
}: {
  article: FrontPageArticle;
  onOpen: () => void;
}) {
  return (
    <article className="border-b border-neutral-200 py-6">
      <button type="button" onClick={onOpen} className="block w-full text-left">
        {article.is_top && (
          <span className="mb-2 inline-block rounded bg-neutral-900 px-2 py-0.5 text-[11px] font-semibold text-white">
            1면 톱
          </span>
        )}
        <h2 className="editorial-title text-xl font-bold leading-snug text-neutral-900">
          {article.title}
        </h2>
        {article.sub_title && (
          <p className="mt-1.5 text-sm leading-6 text-neutral-500">{article.sub_title}</p>
        )}
        <p className="mt-2 text-xs text-neutral-400">
          {article.category}
          {article.author_name ? ` · ${article.author_name}` : ''}
        </p>
        {article.image_url && (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={article.image_url}
              alt={article.title}
              className="mt-3 w-full rounded-lg"
              loading="lazy"
            />
          </>
        )}
        <span className="mt-3 inline-block text-xs font-medium text-neutral-500">
          본문 보기 →
        </span>
      </button>
    </article>
  );
}

export function FrontPageView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const dateParam = searchParams.get('date') ?? undefined;

  const [state, setState] = useState<LoadState>({ phase: 'loading' });

  // 최신 요청만 상태를 커밋 — 빠른 날짜 전환 시 늦게 도착한 이전 응답이
  // 새 화면을 덮어쓰는 stale-response race 방지.
  const loadSeq = useRef(0);
  const load = useCallback((date?: string) => {
    const seq = ++loadSeq.current;
    setState({ phase: 'loading' });
    fetchFrontPage(date)
      .then((data) => {
        if (loadSeq.current === seq) setState({ phase: 'ready', data });
      })
      .catch(() => {
        if (loadSeq.current === seq) setState({ phase: 'error' });
      });
  }, []);

  useEffect(() => {
    load(dateParam);
  }, [dateParam, load]);

  const goDate = (date?: string) => {
    router.replace(date ? `/paper?date=${date}` : '/paper');
  };

  // 본문 페이지로 이동 — 실제 지면일(paper_date)을 넘겨 상세가 같은 목록을
  // 재조회/공유·새로고침에도 해당 기사를 찾도록 한다.
  const openArticle = (newsId: string, paperDate: string) => {
    router.push(
      `/paper/article?id=${encodeURIComponent(newsId)}&date=${encodeURIComponent(paperDate)}`,
    );
  };

  return (
    <div className="min-h-screen bg-white">
      {/* Noto Serif KR 로딩은 layout.tsx <head>의 <link>로 통합(2026-08-06) */}
      <style>{`
        .editorial-title { font-family: 'Noto Serif KR', serif; }
      `}</style>

      <div className="mx-auto max-w-[680px] px-5 pb-24 pt-10">
        <header className="border-b-2 border-neutral-900 pb-4">
          <div className="flex items-center justify-between">
            <Link href="/" className="text-sm text-neutral-500 hover:text-neutral-900">
              ← AI LENS
            </Link>
            {dateParam && (
              <button
                type="button"
                onClick={() => goDate(undefined)}
                className="text-sm text-neutral-500 underline underline-offset-4 hover:text-neutral-900"
              >
                오늘 1면으로
              </button>
            )}
          </div>
          <h1 className="editorial-title mt-3 text-2xl font-black text-neutral-900">
            서울경제 오늘의 1면
          </h1>
          {state.phase === 'ready' && (
            <p className="mt-1 text-sm text-neutral-500">
              {formatPaperDate(state.data.paper_date)}자 지면
            </p>
          )}
        </header>

        {state.phase === 'loading' && (
          <div className="space-y-6 py-8">
            {[0, 1, 2].map((i) => (
              <div key={i} className="animate-pulse space-y-3">
                <div className="h-6 w-4/5 rounded bg-neutral-200" />
                <div className="h-4 w-3/5 rounded bg-neutral-100" />
              </div>
            ))}
          </div>
        )}

        {state.phase === 'error' && (
          <div className="py-16 text-center">
            <p className="text-neutral-500">1면 기사를 불러오지 못했습니다.</p>
            <button
              type="button"
              onClick={() => load(dateParam)}
              className="mt-4 rounded-lg border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50"
            >
              다시 시도
            </button>
          </div>
        )}

        {state.phase === 'ready' && (
          <>
            {state.data.is_fallback && (
              <p className="mt-4 rounded-lg bg-neutral-50 px-4 py-3 text-sm text-neutral-600">
                {formatPaperDate(state.data.requested_date)}에는 지면이 발행되지 않아{' '}
                {formatPaperDate(state.data.paper_date)}자 1면을 표시합니다.
              </p>
            )}

            {state.data.articles.length === 0 ? (
              <div className="py-16 text-center text-neutral-500">
                표시할 1면 기사가 아직 없습니다.
              </div>
            ) : (
              <div>
                {state.data.articles.map((a) => (
                  <ArticleCard
                    key={a.news_id}
                    article={a}
                    onOpen={() => openArticle(a.news_id, state.data.paper_date)}
                  />
                ))}
              </div>
            )}

            <div className="pt-8">
              <button
                type="button"
                onClick={() => goDate(prevDay(state.data.paper_date))}
                className="text-sm text-neutral-500 underline underline-offset-4 hover:text-neutral-900"
              >
                ← 이전 지면 보기
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
