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
