// 타임라인 데이터 계층 — 날짜 하나의 기사를 가져온다. 홈 구역과 /timeline 페이지가 같은 함수를 쓴다.
// 소스는 날짜로 갈린다(shared/constants/timeline.ts): 최근은 서울경제 S3 아카이브(/api/timeline), 그 이전은 빅카인즈(/time-machine).
import { API_URL } from '@/shared/config/apiClient';

/** 서울경제 S3 아카이브의 기사 한 건(최근 구간). */
export interface Article {
  news_id: string;
  title: string;
  published_at: string;
  category: string;
  original_link: string;
  provider?: string;
  /** 취재 기자. 백엔드가 "이현호 기자"처럼 "기자"를 붙여 내려준다 — 화면에서 또 붙이지 말 것. */
  byline?: string;
}

/** 빅카인즈 기사 한 건(과거 구간). 발행 시각은 이 소스가 주지 않는다. byline은 "기자" 없는 맨이름. */
export interface BigKindsArticle {
  news_id: string;
  title: string;
  content: string;
  byline: string;
  category: string;
  original_link: string | null;
}

/** "그날 이걸 샀다면" 카드 — 백엔드가 조사된 시계열로 그 자리에서 계산한다. 데이터가 없는 구간은 카드 자체가 빠진다(추정치로 채우지 않는다). */
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

export interface BigKindsDayData {
  articles: BigKindsArticle[];
  investments: InvestmentScenario[];
}

/**
 * 서버(ISR 페이지)에서는 시간 기준 캐시, 브라우저에서는 no-store.
 * /timeline/[date]는 revalidate + generateStaticParams로 정적/ISR 렌더인데, 서버 fetch가 no-store면 Next가
 * "Page changed from static to dynamic at runtime"을 던져 운영에서 모든 날짜가 500이었다.
 * generateMetadata와 페이지가 같은 fetch를 두 번 부르는 것도 이 캐시로 합쳐진다.
 */
function serverCache(seconds: number): RequestInit {
  return typeof window !== 'undefined' ? { cache: 'no-store' } : { next: { revalidate: seconds } };
}

/** 과거 날짜의 기사는 바뀌지 않으므로 길게, 오늘·최근은 짧게 캐시한다. */
const ARCHIVE_REVALIDATE_SEC = 300;
const BIGKINDS_REVALIDATE_SEC = 86400;

type RawArticle = Partial<Article>;

function toArticles(raw: unknown): Article[] {
  if (!Array.isArray(raw)) return [];
  return (raw as RawArticle[])
    .filter((a) => a && a.title)
    .map((a) => ({
      news_id: a.news_id ?? '',
      title: a.title ?? '',
      published_at: a.published_at ?? '',
      category: a.category ?? '',
      original_link: a.original_link ?? '',
      provider: a.provider,
      byline: a.byline,
    }));
}

/** 최근 구간(서울경제 S3 아카이브)의 그날 기사, 최신순 최대 30건. 실패하면 빈 배열. */
export async function fetchDayArticles(date: string): Promise<Article[]> {
  try {
    const res = await fetch(`${API_URL}/api/timeline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date, mode: 'flat', page_size: 30 }),
      ...serverCache(ARCHIVE_REVALIDATE_SEC),
    });
    if (!res.ok) return [];
    return toArticles((await res.json())?.articles);
  } catch {
    return [];
  }
}

/** 과거 구간(빅카인즈)의 그날 기사와 투자 시나리오. 실패하면 빈 값. */
export async function fetchBigkindsDay(date: string): Promise<BigKindsDayData> {
  const empty: BigKindsDayData = { articles: [], investments: [] };
  try {
    const res = await fetch(`${API_URL}/time-machine?date=${date}`, serverCache(BIGKINDS_REVALIDATE_SEC));
    if (!res.ok) return empty;
    const data = await res.json();
    return {
      articles: Array.isArray(data?.articles) ? data.articles : [],
      investments: Array.isArray(data?.investments) ? data.investments : [],
    };
  } catch {
    return empty;
  }
}

/** front = 1면(면 번호 1), day = 면 번호가 없는 시기의 그날 서울경제 기사, none = 생일 무렵 보관본에 신문이 없음. */
export type FrontPageKind = 'front' | 'day' | 'none';
/** 생일 당일 신문이 아닌 것을 보여 준 까닭. null이면 생일 당일 신문이다. not_yet은 생일이 오늘이라 아직 보관본에 없는 경우. */
export type FrontPageReason = 'sunday' | 'no_paper' | 'not_yet' | 'archive_missing';
const FRONT_KINDS: readonly string[] = ['front', 'day', 'none'];
const FRONT_REASONS: readonly string[] = ['sunday', 'no_paper', 'not_yet', 'archive_missing'];

/** 생일 date에 보여 줄 서울경제(백엔드 time_machine.py front 모드). 생일에 신문이 없으면 서버가 직전 발행일(shown_date)을 골라 준다. */
export interface FrontPageData {
  date: string;
  /** 생일 시기에 신문이 있었다면 무엇이었을지 — 면 번호가 있는 시기면 front, 없으면 day. */
  date_kind: Exclude<FrontPageKind, 'none'>;
  shown_date: string | null;
  kind: FrontPageKind;
  reason: FrontPageReason | null;
  articles: BigKindsArticle[];
}

/** 응답을 FrontPageData로 읽는다. 형식이 다르면 null. */
export function parseFrontPage(date: string, data: unknown): FrontPageData | null {
  if (!data || typeof data !== 'object') return null;
  const body = data as Record<string, unknown>;
  const articles = Array.isArray(body.articles) ? body.articles as BigKindsArticle[] : [];
  // 구버전 백엔드(직전 발행일 대체 전, status만 준다) — 롤백 중에도 생일 당일 1면은 보이게 한다. 나머지는 형식 불일치로 본다.
  if (body.kind === undefined) {
    return body.status === 'ok' && articles.length
      ? { date, date_kind: 'front', shown_date: date, kind: 'front', reason: null, articles }
      : null;
  }
  if (typeof body.kind !== 'string' || !FRONT_KINDS.includes(body.kind)) return null;
  const kind = body.kind as FrontPageKind;
  const shown = typeof body.shown_date === 'string' ? body.shown_date : null;
  if (kind !== 'none' && !shown) return null;
  return {
    date,
    date_kind: body.date_kind === 'day' || body.date_kind === 'front' ? body.date_kind : kind === 'day' ? 'day' : 'front',
    shown_date: shown,
    kind,
    reason: typeof body.reason === 'string' && FRONT_REASONS.includes(body.reason) ? body.reason as FrontPageReason : null,
    articles,
  };
}

/** 생일 date의 그날 신문(기사는 본문이 긴 순). 브라우저에서 호출하며 실패하거나 형식이 다르면 null(빈 결과와 구분). */
export async function fetchFrontPage(date: string): Promise<FrontPageData | null> {
  try {
    const res = await fetch(`${API_URL}/time-machine?front=${encodeURIComponent(date)}`, { cache: 'no-store' });
    if (!res.ok) return null;
    return parseFrontPage(date, await res.json());
  } catch {
    return null;
  }
}

/** 키워드+기간 검색 결과의 기사 한 건(발행일은 날짜만, 없을 수 있다). */
export interface RangeArticle extends BigKindsArticle {
  published_at?: string;
}

export interface RangeSearchParams {
  query: string;
  from: string;
  to: string;
  size?: number;
}

/** 사건 기간에 서울경제가 쓴 기사 — 키워드와 기간으로 찾아 관련도 순으로 돌려준다(최대 20건). 브라우저에서 호출하며 실패하면 null(빈 결과와 구분). */
export async function fetchRangeArticles({ query, from, to, size = 6 }: RangeSearchParams): Promise<RangeArticle[] | null> {
  try {
    const qs = new URLSearchParams({ q: query, from, to, size: String(size), sort: 'relevance' });
    const res = await fetch(`${API_URL}/time-machine?${qs}`);
    if (!res.ok) return null;
    const data = await res.json();
    return Array.isArray(data?.articles) ? data.articles : [];
  } catch {
    return null;
  }
}
