'use client';

// 그날의 서울경제. 생일에 신문이 없으면(일요일 휴간·명절·보관본 누락) 서버가 직전 발행일을 골라 주고,
// 면 번호가 없는 시기(1990~1993, 1996.8~2017.11.12)는 1면 대신 그날 기사를 준다(백엔드 time_machine.py front 모드).
// 이 기기에서는 자료가 아예 없는 날(창간 전·지면 공백·보관본 시작 전)만 판단하고 그 날짜는 서버에 보내지 않는다.
import { useEffect, useState } from 'react';
import { fetchFrontPage, type BigKindsArticle, type FrontPageData } from '@/shared/lib/api/timelineApi';
import { dateLabel } from './birthdayModel';
import { nb } from './keepTogether';

export const FRONT_PAGE_RULES = {
  founded: '1960-08-01',
  /** 기획안 v3의 서울경제 지면 공백 기간. */
  suspended: ['1980-11-26', '1988-07-31'] as const,
  /** 빅카인즈 보관본 시작일. 백엔드 BIGKINDS_MIN_DATE와 같은 값. */
  archiveFrom: '1990-01-01',
};
/** 생일에 신문이 없을 때 서버가 거슬러 찾는 날 수(백엔드 FRONT_LOOKBACK_DAYS와 같은 값, 안내 문구용). */
export const FRONT_LOOKBACK_DAYS = 10;

export type FrontPageNotice = 'before-founding' | 'suspended' | 'before-archive';
export type FrontPageState =
  | { status: 'loading'; date: string }
  | { status: 'ok'; date: string; data: FrontPageData }
  | { status: 'notice'; date: string; notice: FrontPageNotice }
  | { status: 'error'; date: string };

/** 생일 당일 1면이 아닌 것을 보여 줄 때 지면 위에 붙이는 안내. */
export interface FrontNotice { title: string; lines: string[] }

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
export const weekdayOf = (date: string) => WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()];

/** 서버에 묻지 않아도 답이 정해진 날짜면 안내 종류, 아니면 null(조회 필요). */
export function frontPageNotice(date: string): FrontPageNotice | null {
  const { founded, suspended, archiveFrom } = FRONT_PAGE_RULES;
  if (date < founded) return 'before-founding';
  if (date >= suspended[0] && date <= suspended[1]) return 'suspended';
  if (date < archiveFrom) return 'before-archive';
  return null;
}

/**
 * 생일 당일 1면을 보여 주지 못할 때의 안내 — 왜 못 보여 주는지, 대신 무엇을 보여 주는지.
 * 생일 당일 1면이거나 아무것도 찾지 못했으면(kind none, 지면 안에서 따로 안내) null.
 */
export function frontNotice(data: FrontPageData): FrontNotice | null {
  const shown = data.shown_date;
  if (data.kind === 'none' || !shown) return null;
  const sameDay = shown === data.date;
  if (data.kind === 'front' && sameDay) return null;
  const count = nb(`${data.articles.length}건`);
  const lines: string[] = [];
  let title = '이 시기는 1면 기록이 없어요';
  if (!sameDay) {
    const birthday = nb(dateLabel(data.date));
    // 생일 쪽에서 없었던 것은 생일 시기(date_kind)로 말한다 — 면 번호 시기면 '1면', 아니면 '서울경제'(그날 기사 전체).
    const missing = data.date_kind === 'front' ? '서울경제 1면이' : '서울경제가';
    if (data.reason === 'sunday') {
      title = '생일에는 신문이 나오지 않았어요';
      lines.push(`${birthday}은 일요일이라 서울경제가 나오지 ${nb('않았어요.')}`);
    } else if (data.reason === 'not_yet') {
      title = '오늘 신문은 아직 보관본에 없어요';
      lines.push(`오늘(${birthday})자 ${missing} 빅카인즈 보관본에 아직 들어오지 ${nb('않았어요.')}`);
    } else {
      title = '생일 당일 신문을 찾지 못했어요';
      lines.push(`${birthday}자 ${missing} 빅카인즈 보관본에 없어요. 명절 등으로 휴간했거나 보관본에서 ${nb('빠진 날이에요.')}`);
    }
    const shownLabel = nb(`${dateLabel(shown)} ${weekdayOf(shown)}요일자`);
    lines.push(data.kind === 'front'
      ? `대신 가장 가까운 지난 신문인 ${shownLabel} 1면을 ${nb('보여 줘요.')}`
      : `대신 가장 가까운 지난 날짜인 ${shownLabel} 서울경제를 ${nb('찾았어요.')}`);
  }
  if (data.kind === 'day') {
    // 1면을 못 보여 주는 까닭(면 번호 기록이 없는 시기)과, 그 대신 무엇을 어떤 기준으로 골랐는지를 함께 적는다.
    // '~' 앞에서 줄이 갈라져('1996년 8월 / ~2017년') 기간을 '부터 … 까지'로 쓴다. 2017-11-13부터는 면 번호가 있다.
    lines.push(`1990~1993년, ${nb('1996년 8월부터')} ${nb('2017년 11월 12일까지')} 신문은 빅카인즈 보관본에 몇 면 기사인지 기록이 없어 1면을 가려낼 수 ${nb('없어요.')}`);
    lines.push(dayBasisLine(data.basis, count));
  }
  return { title, lines };
}

/** 그날 기사를 고른 기준. 이슈 순위로 고르지 못했으면 왜 본문이 긴 순으로 대신했는지 적는다. */
function dayBasisLine(basis: FrontPageData['basis'], count: string) {
  const longest = `1면 대신 본문이 긴 서울경제 기사 ${count}을 ${nb('보여 줘요.')}`;
  switch (basis) {
    case 'issue': return `그래서 1면 대신, 그날 여러 언론이 가장 많이 다룬 소식을 서울경제 기사로 ${nb('보여 줘요.')}`;
    case 'no_match': return `그날 많이 보도된 소식에 서울경제 기사가 연결되지 않아, ${longest}`;
    case 'ranking_failed': return `지금은 그날 언론 이슈 순위를 불러오지 못해, ${longest}`;
    default: return `그날은 언론 이슈 순위 자료가 없어, ${longest}`;
  }
}

/** 공유 카드("내가 태어난 날 서울경제 1면")에 넣을 기사 — 생일 당일 1면일 때만. 대체한 신문·그날 기사는 넣지 않는다. */
export function shareableFront(state: FrontPageState | null): BigKindsArticle[] {
  if (state?.status !== 'ok') return [];
  const { data } = state;
  return data.kind === 'front' && data.shown_date === state.date ? data.articles : [];
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

/** birthDate가 null이면(연도만 공유된 결과) 조회하지 않는다. */
export function useFrontPage(birthDate: string | null) {
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<FrontPageState | null>(null);
  const notice = birthDate ? frontPageNotice(birthDate) : null;

  useEffect(() => {
    if (!birthDate || notice) return;
    let cancelled = false;
    void fetchFrontPage(birthDate).then(data => {
      if (cancelled) return;
      setLoaded(data ? { status: 'ok', date: birthDate, data } : { status: 'error', date: birthDate });
    });
    return () => { cancelled = true; };
  }, [birthDate, notice, attempt]);

  const state: FrontPageState | null = !birthDate ? null
    : notice ? { status: 'notice', date: birthDate, notice }
    : loaded && loaded.date === birthDate ? loaded
    : { status: 'loading', date: birthDate };
  return {
    state,
    retry: () => { setLoaded(null); setAttempt(value => value + 1); },
  };
}
