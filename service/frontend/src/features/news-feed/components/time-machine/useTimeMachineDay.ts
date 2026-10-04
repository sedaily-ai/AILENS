'use client';

// 선택한 날짜의 기사 목록을 가져와 화면용 행(DayRow)으로 바꾼다. 소스(최근 S3 / 과거 빅카인즈)는 날짜로 갈리고, 화면은 소스를 모른다.
import { useEffect, useState } from 'react';
import { fetchBigkindsDay, fetchDayArticles, type Article, type BigKindsArticle } from '@/shared/lib/api/timelineApi';
import { isArchiveDate } from '@/shared/constants/timeline';
import { kstTimeLabel, kstTodayStr } from '@/shared/lib/date';

/** 홈에서 보여주는 최근 기사 수 상한. */
const LIVE_ROW_LIMIT = 10;
/** 오늘 날짜는 이 주기로 조용히 새로 받는다. */
const LIVE_POLL_MS = 3 * 60 * 1000;

export interface DayRow {
  id: string;
  /** 왼쪽 열: 최근은 시각("20:08"), 과거는 순번("01"). */
  lead: string;
  title: string;
  /** 본문 미리보기(과거 구간만). */
  snippet?: string;
  /** 취재 기자 맨이름(과거 구간만). 화면에서 "기자"를 붙인다. */
  byline?: string;
  href: string | null;
}

export type DayKind = 'live' | 'archive';

const toTimeLabel = (iso: string) => kstTimeLabel(iso)?.slice(-5) ?? '';

/** 시각 열은 "HH:MM"만 쓴다. [시그널] 기사는 속보 목록에서 뺀다(홈 구역의 기존 규칙). */
function toLiveRows(articles: Article[]): DayRow[] {
  return articles
    .filter((a) => !a.title.includes('[시그널]'))
    .sort((a, b) => b.published_at.localeCompare(a.published_at))
    .slice(0, LIVE_ROW_LIMIT)
    .map((a) => ({ id: a.news_id, lead: toTimeLabel(a.published_at), title: a.title, href: a.original_link || null }));
}

function toArchiveRows(articles: BigKindsArticle[]): DayRow[] {
  return articles.map((a, i) => ({
    id: a.news_id,
    lead: String(i + 1).padStart(2, '0'),
    title: a.title,
    snippet: a.content || undefined,
    byline: a.byline || undefined,
    href: a.original_link,
  }));
}

/** rows가 null이면 불러오는 중. 날짜가 바뀌면 곧바로 null로 돌아간다. */
export function useTimeMachineDay(date: string): { rows: DayRow[] | null; kind: DayKind; isLive: boolean } {
  const kind: DayKind = isArchiveDate(date) ? 'live' : 'archive';
  const isLive = date === kstTodayStr();
  const [rows, setRows] = useState<DayRow[] | null>(null);

  // 날짜가 바뀌는 렌더에서 바로 비운다(effect에서 비우면 한 프레임 동안 이전 날짜의 목록이 새 날짜 머리 아래에 보인다).
  const [prevDate, setPrevDate] = useState(date);
  if (date !== prevDate) {
    setPrevDate(date);
    setRows(null);
  }

  useEffect(() => {
    let cancelled = false;
    const load = () =>
      (kind === 'live'
        ? fetchDayArticles(date).then(toLiveRows)
        : fetchBigkindsDay(date).then((d) => toArchiveRows(d.articles))
      ).then((next) => {
        if (!cancelled) setRows(next);
      });
    void load();
    const timer = isLive ? setInterval(() => void load(), LIVE_POLL_MS) : undefined;
    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
    };
  }, [date, kind, isLive]);

  return { rows, kind, isLive };
}
