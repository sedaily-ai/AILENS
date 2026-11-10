'use client';

// 그날의 서울경제. 생일에 신문이 없으면(일요일 휴간·명절·보관본 누락) 서버가 직전 발행일을 골라 주고,
// 면 번호가 없는 시기(1990~1993, 1996.8~2017.11.12)는 1면 대신 그날 기사를 준다(백엔드 time_machine.py front 모드).
// 이 기기에서는 자료가 아예 없는 날(창간 전·지면 공백·보관본 시작 전)만 판단하고 그 날짜는 서버에 보내지 않는다.
import { useEffect, useState } from 'react';
import { fetchFrontPage, type BigKindsArticle, type FrontPageData, type FrontPageReason } from '@/shared/lib/api/timelineApi';
import { dateLabel } from './birthdayModel';
import { NAVER_FROM, NEWSPAPER_SCENE, frontRequestDate, isPaperlessSunday, loadNewspaperYear, loadSedailyNewspaperMonth, type NaverRow, type NewspaperYear, type SedailyNewspaperMonth } from './birthdayNewspaper';
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
  /** naver: 보여 줄 날짜의 네이버 1면 목록(연도 파일에 있을 때만, 신문 장면 스위치가 켜졌을 때만). data는 서버가 준 그대로이고 공유 카드가 쓴다. */
  | { status: 'ok'; date: string; data: FrontPageData; naver?: NaverRow[] }
  | { status: 'notice'; date: string; notice: FrontPageNotice }
  /** 기사 목록 없이 그날 1면 사진만 시도하는 시기(1990년 이전, 스위치가 켜졌을 때만). */
  | { status: 'image-only'; date: string }
  | { status: 'error'; date: string };

/** 생일 당일이 아닌 날의 신문을 보여 줄 때 지면 위에 붙이는 안내. */
export interface FrontNotice { title: string; lines: string[] }

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];
export const weekdayOf = (date: string) => WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()];

/** 선택한 날짜의 신문이 없거나 대체될 때, 입력 화면과 결과 화면에서 함께 쓰는 원인 문구. */
export function frontPageReasonLines(date: string, reason: FrontPageReason | null) {
  const label = dateLabel(date);
  if (reason === 'sunday') return [`${label}은 일요일이라 서울경제가 발행되지 않았어요.`];
  if (reason === 'not_yet') return [`${label}자 서울경제는 아직 보관본에 올라오지 않았어요.`];
  if (reason === 'archive_missing') return [`${label}자 서울경제 자료를 보관본에서 찾지 못했어요.`];
  return [`${label}자 서울경제 자료를 찾지 못했어요.`, '휴간했거나 보관본에서 빠졌을 수 있어요.'];
}

/** 실제로 표시하는 대체 날짜 안내. */
export function frontPageReplacementLine(date: string) {
  return `대신 ${dateLabel(date)}자 서울경제를 보여드려요.`;
}

/** 자료 확인 화면과 결과 화면이 함께 쓰는 확정된 기간 안내. */
export function frontPagePeriodLine(notice: FrontPageNotice, kind: 'photo' | 'article') {
  if (notice === 'before-founding') return '서울경제 창간 전이에요.';
  if (notice === 'suspended') return '해당 기간에는 서울경제가 발행되지 않았어요.';
  return kind === 'article' ? '빅카인즈 보관본은 1990년부터 있어요.' : '이 날짜의 1면 사진을 찾지 못했어요.';
}

export function newspaperAvailabilityText(kind: 'photo' | 'article', status: 'available' | 'loading' | 'missing' | 'unknown' | 'alternative') {
  if (status === 'loading') return '자료를 확인하고 있어요.';
  if (status === 'unknown') return '자료 상태를 확인하지 못했어요.';
  if (status === 'available') return '자료가 있어요.';
  if (status === 'alternative') return '1면인지는 불분명하지만 기사 자료가 있어요.';
  return kind === 'photo' ? '사진 자료를 찾지 못했어요.' : '기사 자료를 찾지 못했어요.';
}

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
  const title = data.reason === 'sunday' ? '선택한 날은 일요일이라 서울경제가 발행되지 않았어요'
    : data.reason === 'not_yet' ? '오늘자 서울경제는 아직 보관본에 없어요'
      : '선택한 날짜의 신문 자료를 찾지 못했어요';
  return {
    title,
    lines: [...frontPageReasonLines(data.date, data.reason), frontPageReplacementLine(shown)],
  };
}

/**
 * 지면 아래 출처 줄 — 기사를 어떤 자료에서 어떤 기준으로 골랐는지. 실제 지면을 옮긴 것이 아니라고 함께 밝힌다.
 * 그날 언론이 가장 많이 다룬 소식으로 골랐을 때(kind day, basis issue)만 기준 문장이 다르고, 나머지는 본문이 긴 순서다.
 * 기사가 없는 상태(찾는 중·오류·안내·보관본에 없음)는 '고른 기사예요'라고 할 것이 없어 ''.
 */
export function frontSourceNote(data: FrontPageData | null) {
  if (!data || data.kind === 'none') return '';
  if (data.source === 'sedaily_archive') return `서울경제 제공 1면 기사 자료예요. 사진이 없는 날도 기사 기록을 ${nb('보여 줘요.')}`;
  const base = `빅카인즈 보관본에서 고른 그날 서울경제 ${nb('기사예요.')} 실제 지면을 옮긴 ${nb('것이 아니에요.')}`;
  if (data?.kind === 'day' && data.basis === 'issue') {
    const filled = data.articles.some(article => !article.coverage);
    return `${base} 그날 여러 언론이 가장 많이 다룬 소식을 ${nb('보여 줘요.')}${filled ? ` 이슈로 고르지 못한 칸은 본문이 긴 ${nb('기사로 채워요.')}` : ''}`;
  }
  return `${base} 기사는 본문이 긴 순서로, 사진 설명은 맨 뒤에 ${nb('보여 줘요.')}`;
}

/**
 * 그날 신문 카드·영수증 제목에 넣을 기사 — 생일 당일 신문이면 면 번호가 있든(kind front) 없든(kind day).
 * 카드는 '1면'이 아니라 '그날 서울경제'라고 부르므로 시기를 가리지 않는다. 대체한 날짜의 신문(일요일·명절 등)은 넣지 않는다.
 */
export function shareableFront(state: FrontPageState | null): BigKindsArticle[] {
  if (state?.status !== 'ok') return [];
  const { data } = state;
  return (data.kind === 'front' || data.kind === 'day') && data.shown_date === state.date ? data.articles : [];
}

/**
 * 도착 페이지(QR로 들어온 사람)가 그날 신문 장면을 그대로 보여 줄 상태인가.
 * 찾는 중·오류·안내(창간 전 등)·1990년 전 사진 시기는 장면이 알아서 그린다. 서버가 답했을 때는 그 날짜의 기사가 있어야 한다 —
 * 서버가 다른 날을 대신 골랐거나 아무것도 못 찾으면 장면의 안내 문구가 '생일'을 말하므로 쓰지 않고 도착 페이지의 안내를 보여 준다.
 */
export function arrivalShowsPaper(state: FrontPageState | null) {
  if (!state) return false;
  if (state.status !== 'ok') return true;
  return shareableFront(state).length > 0;
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
  if (!NEWSPAPER_SCENE) { void loadFrontPage(date, fetcher); return; }
  // 서울경제 원본이 있으면 월 파일만 준비한다. 원본에 날짜가 없을 때만 기존 API를 미리 부른다.
  const request = frontRequestDate(date);
  const [year, month] = date.split('-').map(Number);
  const archive = loadSedailyNewspaperMonth(year, month);
  void archive.then(file => {
    const hasSourceDay = file?.days[date]?.some(article => article.title.trim());
    if (!hasSourceDay) {
      void loadFrontPage(request, fetcher);
      if (request >= NAVER_FROM) void loadNewspaperYear(Number(request.slice(0, 4)));
    }
  });
}

export interface FrontScene {
  /** 서버가 고른 신문 그대로(생일 기준으로 맞춘 date·reason만 다르다). 공유 카드가 쓴다. */
  data: FrontPageData;
  /** 보여 줄 날짜의 네이버 1면 목록. 없으면 null. */
  naver: NaverRow[] | null;
}
interface SceneDeps {
  front: (date: string) => Promise<FrontPageData | null>;
  year: (year: number) => Promise<NewspaperYear | null>;
  month?: (year: number, month: number) => Promise<SedailyNewspaperMonth | null>;
}

/** 서버는 요청한 날짜(일요일이면 월요일)를 기준으로 답한다. 화면은 생일 기준으로 읽으므로 date와 까닭을 맞춘다. */
function asBirthday(data: FrontPageData, birthDate: string): FrontPageData {
  const substituted = data.kind !== 'none' && data.shown_date !== null && data.shown_date !== birthDate;
  // 일요일자가 없는 시기의 일요일은 서버가 어떤 까닭(no_paper·not_yet)을 적었든 '일요일이라 없다'가 사실이다.
  const reason = substituted && isPaperlessSunday(birthDate) ? 'sunday' : data.reason;
  return data.date === birthDate && reason === data.reason ? data : { ...data, date: birthDate, reason };
}

/**
 * 생일 birthDate의 그날 신문. 신문 장면이 꺼져 있으면 서버 답 그대로이고, 켜져 있으면
 * ① 일요일이면 월요일부터 묻고(없으면 서버가 토요일을 고른다) ② 서버가 고른 날짜가 네이버 1면 목록 제공 시기면 연도 파일의 그날 목록을 붙인다.
 * 연도 파일이 없거나 그날이 없어도 실패가 아니다(빅카인즈 기사로 보여 준다). 서버 요청이 실패하면 null.
 */
export async function loadFrontScene(birthDate: string, deps: SceneDeps = { front: loadFrontPage, year: loadNewspaperYear, month: loadSedailyNewspaperMonth }, enabled = NEWSPAPER_SCENE): Promise<FrontScene | null> {
  if (!enabled) {
    const data = await deps.front(birthDate);
    return data && { data, naver: null };
  }
  // 받은 서울경제 CSV가 해당 날짜를 담고 있으면 이를 최우선 원본으로 쓴다.
  // 월 파일에 날짜가 없거나 읽지 못했을 때만 기존 BigKinds/네이버 경로로 되돌아간다.
  const [year, month] = birthDate.split('-').map(Number);
  const archive = await deps.month?.(year, month);
  const sourceRows = archive?.days[birthDate]?.filter(article => article.title.trim()) ?? [];
  if (sourceRows.length) {
    const articles: BigKindsArticle[] = sourceRows.map(article => ({
      news_id: article.id,
      title: article.title,
      content: [article.subtitle, article.body].filter(Boolean).join('\n\n'),
      byline: '',
      category: '',
      original_link: null,
    }));
    return {
      data: { date: birthDate, source: 'sedaily_archive', date_kind: 'front', shown_date: birthDate, kind: 'front', reason: null, basis: null, articles },
      naver: null,
    };
  }
  const request = frontRequestDate(birthDate);
  const requestYear = Number(request.slice(0, 4));
  // 목록 파일은 서버 답을 기다리지 않고 함께 받는다 — 보여 줄 날짜는 대개 요청한 날짜와 같은 해다.
  const early = request >= NAVER_FROM ? deps.year(requestYear) : null;
  const served = await deps.front(request);
  if (!served) return null;
  const data = asBirthday(served, birthDate);
  const shown = data.kind === 'none' ? null : data.shown_date;
  if (!shown || shown < NAVER_FROM) return { data, naver: null };
  const shownYear = Number(shown.slice(0, 4));
  const file = await (early && shownYear === requestYear ? early : deps.year(shownYear));
  return { data, naver: file?.days[shown] ?? null };
}

/** birthDate가 null이면(연도만 공유된 결과) 조회하지 않는다. */
export function useFrontPage(birthDate: string | null) {
  const [attempt, setAttempt] = useState(0);
  const [loaded, setLoaded] = useState<FrontPageState | null>(null);
  const notice = birthDate ? frontPageNotice(birthDate) : null;

  useEffect(() => {
    if (!birthDate || notice) return;
    let cancelled = false;
    void loadFrontScene(birthDate).then(scene => {
      if (cancelled) return;
      setLoaded(scene ? { status: 'ok', date: birthDate, data: scene.data, ...(scene.naver ? { naver: scene.naver } : {}) } : { status: 'error', date: birthDate });
    });
    return () => { cancelled = true; };
  }, [birthDate, notice, attempt]);

  const state: FrontPageState | null = !birthDate ? null
    // 1990년 이전 시기는 서버에 묻지 않는다. 신문 장면이 켜져 있으면 그날 1면 사진이 있는지만 본다.
    : notice === 'before-archive' && NEWSPAPER_SCENE ? { status: 'image-only', date: birthDate }
    : notice ? { status: 'notice', date: birthDate, notice }
    : loaded && loaded.date === birthDate ? loaded
    : { status: 'loading', date: birthDate };
  return {
    state,
    retry: () => { setLoaded(null); setAttempt(value => value + 1); },
  };
}
