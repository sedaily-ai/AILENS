/**
 * "그날로 떠나요"(타임머신) 데이터 — 날짜 하나의 기사. 웹 shared/lib/api/timelineApi.ts 와 같은 계약.
 * 소스는 날짜로 갈린다: 서울경제 S3 아카이브(2026-02-01~, POST {apiUrl}/api/timeline), 그 이전은 빅카인즈(GET {apiUrl}/time-machine?date=).
 */
import { getApiConfig } from './config.js';

/** 서울경제 S3 아카이브가 커버하는 최소 날짜. 웹 shared/constants/timeline.ts 의 ARCHIVE_MIN_DATE 와 같다. */
export const ARCHIVE_MIN_DATE = '2026-02-01';
export const BIGKINDS_MIN_DATE = '1990-01-01';

/** 날짜가 S3 아카이브 구간(최근)인지. 아니면 빅카인즈 구간. */
export const isArchiveDate = (date: string) => date >= ARCHIVE_MIN_DATE;

export interface DayArticle {
  news_id: string;
  title: string;
  published_at: string;
  category: string;
  original_link: string;
  provider?: string;
  /** "이현호 기자"처럼 "기자"가 이미 붙어서 온다. */
  byline?: string;
  content?: string;
  image_url?: string | null;
}

export interface BigKindsArticle {
  news_id: string;
  title: string;
  content: string;
  /** "기자" 없는 맨이름. */
  byline: string;
  category: string;
  original_link: string | null;
}

/** "그날 이걸 샀다면" 카드 — 백엔드가 실측 시계열로 계산한다. 데이터가 없는 구간은 카드가 빠진다. */
export interface InvestmentScenario {
  id: string;
  emoji: string;
  label: string;
  description: string;
  result: string;
  highlight: string;
  story: string | null;
  source_label: string;
}

export interface BigKindsDay {
  articles: BigKindsArticle[];
  investments: InvestmentScenario[];
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`요청 실패 (${res.status})`);
  return (await res.json()) as T;
}

/** 최근 구간의 그날 기사, 최신순 최대 30건. 실패는 throw(화면이 재시도를 보여 준다). */
export async function fetchDayArticles(date: string, signal?: AbortSignal): Promise<DayArticle[]> {
  const res = await fetch(`${getApiConfig().apiUrl}/api/timeline`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date, mode: 'flat', page_size: 30 }),
    signal,
  });
  const data = await json<{ articles?: DayArticle[] }>(res);
  return (data.articles ?? []).filter((a) => a && a.title);
}

/** 과거 구간(빅카인즈)의 그날 기사와 투자 시나리오. */
export async function fetchBigkindsDay(date: string, signal?: AbortSignal): Promise<BigKindsDay> {
  const res = await fetch(`${getApiConfig().apiUrl}/time-machine?date=${encodeURIComponent(date)}`, { signal });
  const data = await json<Partial<BigKindsDay>>(res);
  return { articles: Array.isArray(data.articles) ? data.articles : [], investments: Array.isArray(data.investments) ? data.investments : [] };
}
