'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { fetchFrontPage, type FrontPageArticle } from '../api/frontPageApi';
import { ArticleBlocks } from './ArticleBlocks';
import { formatPaperDate } from '../lib/dateLabels';

type LoadState =
  | { phase: 'loading' }
  | { phase: 'error' }
  | { phase: 'notfound' }
  | { phase: 'ready'; article: FrontPageArticle; paperDate: string };

export function FrontPageArticleView() {
  const searchParams = useSearchParams();
  const id = searchParams.get('id') ?? undefined;
  const date = searchParams.get('date') ?? undefined;

  const [state, setState] = useState<LoadState>({ phase: 'loading' });

  // FrontPageView 와 동일한 stale-response 가드.
  const loadSeq = useRef(0);
  const load = useCallback((articleId?: string, d?: string) => {
    const seq = ++loadSeq.current;
    if (!articleId) {
      setState({ phase: 'notfound' });
      return;
    }
    setState({ phase: 'loading' });
    fetchFrontPage(d)
      .then((data) => {
        if (loadSeq.current !== seq) return;
        const found = data.articles.find((a) => a.news_id === articleId);
        setState(
          found
            ? { phase: 'ready', article: found, paperDate: data.paper_date }
            : { phase: 'notfound' },
        );
      })
      .catch(() => {
        if (loadSeq.current === seq) setState({ phase: 'error' });
      });
  }, []);

  useEffect(() => {
    load(id, date);
  }, [id, date, load]);

  const backHref = date ? `/paper?date=${date}` : '/paper';

  return (
    <div className="min-h-screen bg-white">
      {/* Noto Serif KR 로딩은 layout.tsx <head>의 <link>로 통합(2026-08-06) */}
      <style>{`
        .editorial-title { font-family: 'Noto Serif KR', serif; }
      `}</style>

      <div className="mx-auto max-w-[680px] px-5 pb-24 pt-10">
        <Link href={backHref} className="text-sm text-neutral-500 hover:text-neutral-900">
          ← 오늘의 1면
        </Link>

        {state.phase === 'loading' && (
          <div className="animate-pulse space-y-4 py-10">
            <div className="h-7 w-11/12 rounded bg-neutral-200" />
            <div className="h-4 w-2/3 rounded bg-neutral-100" />
            <div className="h-64 w-full rounded bg-neutral-100" />
          </div>
        )}

        {state.phase === 'error' && (
          <div className="py-16 text-center">
            <p className="text-neutral-500">기사를 불러오지 못했습니다.</p>
            <button
              type="button"
              onClick={() => load(id, date)}
              className="mt-4 rounded-lg border border-neutral-300 px-4 py-2 text-sm hover:bg-neutral-50"
            >
              다시 시도
            </button>
          </div>
        )}

        {state.phase === 'notfound' && (
          <div className="py-16 text-center text-neutral-500">
            <p>기사를 찾을 수 없습니다.</p>
            <Link
              href={backHref}
              className="mt-4 inline-block text-sm underline underline-offset-4 hover:text-neutral-900"
            >
              1면 목록으로
            </Link>
          </div>
        )}

        {state.phase === 'ready' && (
          <article className="pt-6">
            {state.article.is_top && (
              <span className="mb-2 inline-block rounded bg-neutral-900 px-2 py-0.5 text-[11px] font-semibold text-white">
                1면 톱
              </span>
            )}
            <h1 className="editorial-title text-2xl font-black leading-snug text-neutral-900">
              {state.article.title}
            </h1>
            {state.article.sub_title && (
              <p className="mt-2 text-base leading-7 text-neutral-500">
                {state.article.sub_title}
              </p>
            )}
            <p className="mt-3 border-b border-neutral-200 pb-4 text-xs text-neutral-400">
              {formatPaperDate(state.paperDate)}자 지면
              {state.article.category ? ` · ${state.article.category}` : ''}
              {state.article.author_name ? ` · ${state.article.author_name}` : ''}
            </p>

            <div className="mt-6">
              {/* content_blocks 에 이미지 블록이 없을 때만 대표 이미지를 상단에 노출
                  (블록 안에 이미지가 있으면 ArticleBlocks 가 제 위치에 렌더 — 중복 방지). */}
              {!state.article.content_blocks.some((b) => b.type === 'image' && b.url) &&
                state.article.image_url && (
                  <>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={state.article.image_url}
                      alt={state.article.title}
                      className="mb-5 w-full rounded-lg"
                      loading="lazy"
                    />
                  </>
                )}
              <ArticleBlocks
                blocks={state.article.content_blocks}
                fallbackText={state.article.content}
              />
            </div>

            {state.article.url && (
              <a
                href={state.article.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-8 inline-block text-sm text-neutral-500 underline underline-offset-4 hover:text-neutral-900"
              >
                서울경제 원문 보기 ↗
              </a>
            )}
          </article>
        )}
      </div>
    </div>
  );
}
