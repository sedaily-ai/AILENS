'use client';

// 타임머신 신문 — "그날 서울경제" 장면의 1면 사진 주소, 네이버 1면 목록(S3 연도 파일), 일요일에 요청할 날짜.
// 표시 규칙: timemachine-data/261103_타임머신_신문장면_표시규칙.md · 연도 파일 형식: timemachine-data/README.md "데이터 구조".
// 두 파일 모두 같은 출처(/timemachine-newspaper/*, CloudFront → S3)라서 서버 호출이 아니고, 주소에 드러나는 것은 날짜(사진)·연도(목록)뿐이다.
import type { BigKindsArticle } from '@/shared/lib/api/timelineApi';

/**
 * 신문 장면(1면 사진·네이버 1면 목록·새 문구·일요일 대체) 스위치. 이미지 업로드를 확인한 뒤 true로 바꾼다. 꺼져 있으면 지금과 같게 동작한다.
 * 로컬 확인용으로 NEXT_PUBLIC_TIMEMACHINE_NEWSPAPER=on 도 켠다. NEXT_PUBLIC_* 는 빌드 때 고정되고 운영 빌드는 이 값을 넘기지 않는다(service/frontend/Dockerfile).
 */
const SWITCHED_ON = false;
export const NEWSPAPER_SCENE = SWITCHED_ON || process.env.NEXT_PUBLIC_TIMEMACHINE_NEWSPAPER === 'on';

export const NEWSPAPER_BASE = '/timemachine-newspaper';
/** 네이버 신문보기에 서울경제 1면 목록이 처음 나오는 날(2011-07-08과 일요일은 "발행된 종이신문이 없거나…"). */
export const NAVER_FROM = '2011-07-09';
/** 이 날부터 일요일자 신문이 없다(요구사항 HTML·표시 규칙 3절). */
export const NO_SUNDAY_FROM = '1996-09-29';

/** 날짜로 정해진 원본 사진 주소. 올리면 바로 보이고, 없으면 404다. */
export function newspaperImageUrl(date: string) {
  const [year, month] = date.split('-');
  return `${NEWSPAPER_BASE}/img/${year}/${month}/${date.replaceAll('-', '')}.jpg`;
}
export const newspaperYearUrl = (year: number) => `${NEWSPAPER_BASE}/index/v1/${year}.json`;

export function shiftDate(date: string, days: number) {
  const moved = new Date(`${date}T00:00:00Z`);
  moved.setUTCDate(moved.getUTCDate() + days);
  return moved.toISOString().slice(0, 10);
}

/** 일요일자가 없는 시기의 일요일인가. */
export const isPaperlessSunday = (date: string) => date >= NO_SUNDAY_FROM && new Date(`${date}T00:00:00Z`).getUTCDay() === 0;

/**
 * 서버에 그날 신문을 물을 날짜. 일요일자가 없는 시기의 일요일이면 다음 날 월요일을 묻는다 —
 * 월요일자가 있으면 그것을, 없으면 서버가 하루씩 거슬러 토요일을 골라 준다(요구사항: 월요일 먼저, 없으면 토요일).
 */
export const frontRequestDate = (birthDate: string) => isPaperlessSunday(birthDate) ? shiftDate(birthDate, 1) : birthDate;

/** 네이버 신문보기 1면 기사 한 건(연도 파일). rank는 네이버가 준 순서이고 중요도가 아니다. */
export interface NaverRow { rank: number; title: string; url: string }
export interface NewspaperYear { year: number; days: Record<string, NaverRow[]> }

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);

function parseRow(raw: unknown): NaverRow | null {
  if (!isRecord(raw)) return null;
  const { rank, title, url } = raw;
  // 주소는 링크로 걸리므로 https만 받는다(javascript: 같은 주소를 막는다).
  if (typeof rank !== 'number' || !Number.isInteger(rank) || rank < 1) return null;
  if (typeof title !== 'string' || !title.trim() || typeof url !== 'string' || !url.startsWith('https://')) return null;
  return { rank, title, url };
}

/** 연도 파일 v1 읽기. 형식이 다르거나 연도가 안 맞으면 null(그 해는 목록 없이 기존 방식으로 보여 준다). */
export function parseNewspaperYear(raw: unknown, year: number): NewspaperYear | null {
  if (!isRecord(raw) || raw.schema !== 1 || raw.year !== year || !isRecord(raw.days)) return null;
  const days: Record<string, NaverRow[]> = {};
  for (const [date, entry] of Object.entries(raw.days)) {
    if (!DATE.test(date) || !isRecord(entry) || !Array.isArray(entry.articles)) return null;
    const rows = entry.articles.map(parseRow);
    if (!rows.length || rows.some(row => row === null)) return null;
    days[date] = (rows as NaverRow[]).sort((a, b) => a.rank - b.rank);
  }
  return { year, days };
}

type YearFetcher = (year: number) => Promise<NewspaperYear | null>;

/** 파일이 없는 해(404)와 받기 실패는 모두 null — 목록이 없는 것과 같게 다룬다. */
async function fetchNewspaperYear(year: number): Promise<NewspaperYear | null> {
  try {
    const res = await fetch(newspaperYearUrl(year));
    if (!res.ok) return null;
    return parseNewspaperYear(await res.json(), year);
  } catch {
    return null;
  }
}

// 같은 해 요청을 한 번만 보낸다(이 탭 메모리). 없는 해는 기억하지 않아 다시 불러오기가 새로 묻는다.
const yearRequests = new Map<number, Promise<NewspaperYear | null>>();

export function loadNewspaperYear(year: number, fetcher: YearFetcher = fetchNewspaperYear) {
  const known = yearRequests.get(year);
  if (known) return known;
  const request = fetcher(year).catch(() => null).then(file => {
    if (!file) yearRequests.delete(year);
    return file;
  });
  yearRequests.set(year, request);
  return request;
}

/** 기사 목록 컴포넌트가 읽는 모양으로 바꾼다. 링크는 네이버 신문보기 기사 주소 그대로다. */
export function naverArticles(rows: NaverRow[]): BigKindsArticle[] {
  return rows.map(row => ({ news_id: `naver-${row.rank}`, title: row.title, content: '', byline: '', category: '', original_link: row.url }));
}
