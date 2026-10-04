'use client';

// "그 무렵 서울경제 기사" — 사건 기간을 사건 키워드로 검색한 관련도 순 기사. 누를 때 한 번만 불러온다.
import { useEffect, useState } from 'react';
import { fetchRangeArticles, type RangeArticle } from '@/shared/lib/api/timelineApi';
import { addDays } from '@/shared/lib/date/timelineDates';
import { kstTodayStr } from '@/shared/lib/date/date';
import type { TimelineEvent } from '@/shared/data/timelineEvents';
import { resolveArticleLink } from '@/features/timeline/lib/articleLinks';
import { TEXT_STRONG, TEXT_MUTED, TEXT_BODY, BORDER_HAIRLINE, BORDER_CONTROL, FONT, TOUCH_MIN } from '@/features/timeline/lib/tone';

/** 사건 기간: 시작일부터 끝(기간 사건) 또는 2주 뒤까지. 월 단위 사건은 그 달 전체. */
function searchRange(event: TimelineEvent): { from: string; to: string } {
  const today = kstTodayStr();
  if (event.date.length === 7) {
    const from = `${event.date}-01`;
    const to = addDays(`${event.date}-28`, 4).slice(0, 7) === event.date ? `${event.date}-31` : `${event.date}-28`;
    return { from, to: to > today ? today : to };
  }
  const to = event.endDate ?? addDays(event.date, 14);
  return { from: event.date, to: to > today ? today : to };
}

type State = { status: 'idle' } | { status: 'loading' } | { status: 'error' } | { status: 'done'; articles: RangeArticle[] };

export function EventArticles({ event, autoLoad = false }: { event: TimelineEvent; autoLoad?: boolean }) {
  const [state, setState] = useState<State>(autoLoad ? { status: 'loading' } : { status: 'idle' });

  const load = () => {
    setState({ status: 'loading' });
    const { from, to } = searchRange(event);
    void fetchRangeArticles({ query: event.keywords[0], from, to, size: 6 }).then((articles) =>
      setState(articles === null ? { status: 'error' } : { status: 'done', articles }),
    );
  };

  // autoLoad: 사건이 바뀔 때마다(부모가 key로 다시 마운트) 한 번 자동으로 불러온다.
  useEffect(() => {
    if (!autoLoad) return;
    let cancelled = false;
    const { from, to } = searchRange(event);
    void fetchRangeArticles({ query: event.keywords[0], from, to, size: 6 }).then((articles) => {
      if (!cancelled) setState(articles === null ? { status: 'error' } : { status: 'done', articles });
    });
    return () => {
      cancelled = true;
    };
  }, [autoLoad, event]);

  if (state.status === 'idle') {
    return (
      <button type="button" onClick={load} className="tl-focus" style={buttonStyle}>
        그 무렵 서울경제 기사 보기
      </button>
    );
  }

  return (
    <div role="status" aria-live="polite" style={{ marginTop: 4 }}>
      {state.status === 'loading' && <p style={{ fontSize: FONT.meta, color: TEXT_MUTED }}>기사를 찾는 중이에요…</p>}
      {state.status === 'error' && (
        <p style={{ fontSize: FONT.meta, color: TEXT_MUTED }}>
          기사를 가져오지 못했어요.{' '}
          <button type="button" onClick={load} className="tl-focus" style={{ ...linkButtonStyle }}>
            다시 시도
          </button>
        </p>
      )}
      {state.status === 'done' && state.articles.length === 0 && (
        <p style={{ fontSize: FONT.meta, color: TEXT_MUTED, lineHeight: 1.6 }}>이 기간의 서울경제 기사는 아직 아카이브에서 찾지 못했어요.</p>
      )}
      {state.status === 'done' && state.articles.length > 0 && (
        <ol style={{ listStyle: 'none', margin: 0, padding: 0, borderTop: `1px solid ${BORDER_HAIRLINE}` }}>
          {state.articles.map((a) => {
            const link = resolveArticleLink(a);
            const title = (
              <span style={{ fontSize: FONT.body, fontWeight: 600, color: TEXT_STRONG, lineHeight: 1.5, wordBreak: 'keep-all' }}>{a.title}</span>
            );
            return (
              <li key={a.news_id} style={{ padding: '10px 2px', borderBottom: `1px solid ${BORDER_HAIRLINE}` }}>
                {link ? (
                  <a href={link.href} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>{title}</a>
                ) : (
                  title
                )}
                <p style={{ fontSize: FONT.caption, color: TEXT_MUTED, marginTop: 4, fontVariantNumeric: 'tabular-nums' }}>
                  {a.published_at ?? ''}
                  {a.content && <span style={{ color: TEXT_BODY }}>{a.published_at ? ' · ' : ''}{a.content.slice(0, 60)}…</span>}
                </p>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

const buttonStyle = {
  display: 'inline-flex', alignItems: 'center', minHeight: TOUCH_MIN, padding: '0 16px', borderRadius: 9999,
  border: `1px solid ${BORDER_CONTROL}`, background: 'transparent', color: TEXT_STRONG, fontSize: FONT.meta, fontWeight: 700, cursor: 'pointer',
} as const;

const linkButtonStyle = { background: 'none', border: 'none', padding: 0, color: TEXT_STRONG, textDecoration: 'underline', cursor: 'pointer', fontSize: 'inherit' } as const;
