'use client';

// 그날의 서울경제 1면. 면 번호가 없는 시기·휴간일·발행 전 시기는 서버에 날짜를 보내지 않고 이 기기에서 안내한다.
// 기간 값은 백엔드 handlers/timeline/time_machine.py 의 FRONT_PAGE_ERAS·SUNDAY_CLOSED_FROM(2026-10-19 빅카인즈 실측)과 같아야 한다.
import { useEffect, useState } from 'react';
import { fetchFrontPage, type BigKindsArticle } from '@/shared/lib/api/timelineApi';

export const FRONT_PAGE_RULES = {
  founded: '1960-08-01',
  /** 기획안 v3의 서울경제 지면 공백 기간. */
  suspended: ['1980-11-26', '1988-07-31'] as const,
  archiveFrom: '1990-01-01',
  pageInfo: [['1994-01-01', '1996-07-31'], ['2017-11-13', null]] as const,
  sundayClosedFrom: '1996-09-29',
};

export type FrontPageNotice = 'before-founding' | 'suspended' | 'before-archive' | 'no-page-info' | 'sunday' | 'holiday';
export type FrontPageState =
  | { status: 'loading'; date: string }
  | { status: 'ok'; date: string; articles: BigKindsArticle[] }
  | { status: 'notice'; date: string; notice: FrontPageNotice }
  | { status: 'error'; date: string };

const isSunday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay() === 0;

/** 서버에 묻지 않아도 답이 정해진 날짜면 안내 종류, 아니면 null(조회 필요). */
export function frontPageNotice(date: string): FrontPageNotice | null {
  const { founded, suspended, archiveFrom, pageInfo, sundayClosedFrom } = FRONT_PAGE_RULES;
  if (date < founded) return 'before-founding';
  if (date >= suspended[0] && date <= suspended[1]) return 'suspended';
  if (date < archiveFrom) return 'before-archive';
  if (isSunday(date) && date >= sundayClosedFrom) return 'sunday';
  if (!pageInfo.some(([start, end]) => date >= start && (end === null || date <= end))) return 'no-page-info';
  return null;
}

export function previousDay(date: string) {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() - 1);
  return value.toISOString().slice(0, 10);
}

/**
 * 기사 제목에 걸 링크 — 서울경제 원문이 살아 있으면 원문, 옛 sednews.com 주소면 빅카인즈 상세.
 * features/timeline/lib/articleLinks.ts 와 같은 규칙이며, 기능 간 import 금지(FSD) 때문에 이 기능 안에 둔다.
 */
export function frontArticleHref(article: Pick<BigKindsArticle, 'original_link' | 'news_id'>) {
  try {
    if (article.original_link && !/^(www\.)?sednews\.com$/i.test(new URL(article.original_link).host)) return article.original_link;
  } catch { /* 주소 형식이 아니면 빅카인즈로 */ }
  return /^\d+\.\d+$/.test(article.news_id ?? '') ? `https://www.bigkinds.or.kr/v2/news/newsDetailView.do?newsId=${encodeURIComponent(article.news_id)}` : null;
}

/** date가 null이면(연도만 공유된 결과) 조회하지 않는다. show(다른 날짜)는 휴간일의 "하루 전 신문 1면 보기"에 쓴다. */
export function useFrontPage(birthDate: string | null) {
  const [requested, setRequested] = useState(birthDate);
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<FrontPageState | null>(null);
  const notice = requested ? frontPageNotice(requested) : null;

  useEffect(() => {
    if (!requested || notice) return;
    let cancelled = false;
    void fetchFrontPage(requested).then(data => {
      if (cancelled) return;
      if (!data) setLoaded({ status: 'error', date: requested });
      else if (data.status === 'ok') setLoaded({ status: 'ok', date: requested, articles: data.articles });
      else setLoaded({ status: 'notice', date: requested, notice: data.status === 'no_page_info' ? 'no-page-info' : data.reason === 'sunday' ? 'sunday' : 'holiday' });
    });
    return () => { cancelled = true; };
  }, [requested, notice, attempt]);

  const state: FrontPageState | null = !requested ? null
    : notice ? { status: 'notice', date: requested, notice }
    : loaded && loaded.date === requested ? loaded
    : { status: 'loading', date: requested };
  return {
    state,
    show: (date: string) => setRequested(date),
    retry: () => { setLoaded(null); setAttempt(value => value + 1); },
  };
}
