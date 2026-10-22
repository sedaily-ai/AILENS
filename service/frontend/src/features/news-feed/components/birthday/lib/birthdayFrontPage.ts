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

/** 생일 당일이 아닌 날의 신문을 보여 줄 때 지면 위에 붙이는 안내. */
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
 * 생일 당일 신문을 보여 주지 못할 때의 안내 — 왜 못 보여 주는지, 대신 어느 날 신문을 보여 주는지.
 * 생일 당일 신문이거나(kind front·day 모두) 아무것도 찾지 못했으면(kind none, 지면 안에서 따로 안내) null.
 * 우리는 실제 지면이 아니라 보관본에서 고른 기사를 보여 주므로 '1면'이라고 부르지 않는다. 기사를 고른 기준은 지면 아래 출처 줄(frontSourceNote)에 둔다.
 */
export function frontNotice(data: FrontPageData): FrontNotice | null {
  const shown = data.shown_date;
  if (data.kind === 'none' || !shown || shown === data.date) return null;
  const birthday = nb(dateLabel(data.date));
  const lines: string[] = [];
  let title: string;
  if (data.reason === 'sunday') {
    title = '생일에는 신문이 나오지 않았어요';
    lines.push(`${birthday}은 일요일이라 서울경제가 나오지 ${nb('않았어요.')}`);
  } else if (data.reason === 'not_yet') {
    title = '오늘 신문은 아직 보관본에 없어요';
    lines.push(`오늘(${birthday})자 서울경제가 빅카인즈 보관본에 아직 들어오지 ${nb('않았어요.')}`);
  } else {
    title = '생일 당일 신문을 찾지 못했어요';
    lines.push(`${birthday}자 서울경제가 빅카인즈 보관본에 없어요. 명절 등으로 휴간했거나 보관본에서 ${nb('빠진 날이에요.')}`);
  }
  lines.push(`대신 가장 가까운 지난 신문인 ${nb(`${dateLabel(shown)} ${weekdayOf(shown)}요일자`)} 서울경제를 ${nb('보여 줘요.')}`);
  return { title, lines };
}

/**
 * 지면 아래 출처 줄 — 기사를 어떤 자료에서 어떤 기준으로 골랐는지. 실제 지면을 옮긴 것이 아니라고 함께 밝힌다.
 * 그날 언론이 가장 많이 다룬 소식으로 골랐을 때(kind day, basis issue)만 기준 문장이 다르고, 나머지는 본문이 긴 순서다.
 * 기사가 없는 상태(찾는 중·오류·안내·보관본에 없음)는 '고른 기사예요'라고 할 것이 없어 ''.
 */
export function frontSourceNote(data: FrontPageData | null) {
  if (!data || data.kind === 'none') return '';
  const base = `빅카인즈 보관본에서 고른 그날 서울경제 ${nb('기사예요.')} 실제 지면을 옮긴 ${nb('것이 아니에요.')}`;
  if (data?.kind === 'day' && data.basis === 'issue') {
    const filled = data.articles.some(article => !article.coverage);
    return `${base} 그날 여러 언론이 가장 많이 다룬 소식을 ${nb('보여 줘요.')}${filled ? ` 이슈로 고르지 못한 칸은 본문이 긴 ${nb('기사로 채워요.')}` : ''}`;
  }
  return `${base} 기사는 본문이 긴 순서로, 사진 설명은 맨 뒤에 ${nb('보여 줘요.')}`;
}

/** 그날 신문 카드에 넣을 기사 — 생일 당일 kind front일 때만. 대체한 날짜의 신문·kind day 기사는 넣지 않는다. */
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

type FrontPageFetcher = (date: string) => Promise<FrontPageData | null>;

// 같은 날짜 요청을 한 번만 보낸다 — 개발 모드 StrictMode의 효과 두 번 실행, '타임머신 타기' 직후 미리 보낸 요청과
// 결과 화면의 요청을 하나로 묶는다. 이 탭 메모리에만 있고(새로고침·탭 닫기로 사라짐) 브라우저 HTTP 캐시는 쓰지 않는다.
const frontPageRequests = new Map<string, Promise<FrontPageData | null>>();

/** 생일 date의 그날 신문. 진행 중이거나 성공한 같은 날짜 요청이 있으면 그것을 함께 쓴다. */
export function loadFrontPage(date: string, fetcher: FrontPageFetcher = fetchFrontPage) {
  const known = frontPageRequests.get(date);
  if (known) return known;
  const request = fetcher(date).catch(() => null).then(data => {
    // 실패는 기억하지 않는다 — '다시 불러오기'가 새 요청을 보낸다.
    if (!data) frontPageRequests.delete(date);
    return data;
  });
  frontPageRequests.set(date, request);
  return request;
}

/** '타임머신 타기'를 누른 뒤에만 부른다. 서버에 묻지 않는 날짜(창간 전·지면 공백·보관본 전)는 보내지 않는다. */
export function prefetchFrontPage(date: string, fetcher?: FrontPageFetcher) {
  if (frontPageNotice(date)) return;
  void loadFrontPage(date, fetcher);
}

/** birthDate가 null이면(연도만 공유된 결과) 조회하지 않는다. */
export function useFrontPage(birthDate: string | null) {
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<FrontPageState | null>(null);
  const notice = birthDate ? frontPageNotice(birthDate) : null;

  useEffect(() => {
    if (!birthDate || notice) return;
    let cancelled = false;
    void loadFrontPage(birthDate).then(data => {
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
