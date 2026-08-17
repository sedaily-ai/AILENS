// 타임라인(뉴스 타임머신) 데이터 계층 — NewsTimeMachine.tsx(인터랙티브 입력+되감기
// 애니메이션)와 app/timeline/[date]/page.tsx(날짜별 SSR 결과 페이지) 양쪽이
// 같이 쓴다. 원래 NewsTimeMachine.tsx 안에 있던 걸 분리했다(2026-08-12,
// "날짜별 고유 URL이 있어야 검색엔진이 하루하루를 색인할 수 있다"는 GEO
// 감사 결론 — 서버 컴포넌트에서도 같은 fetch 로직을 재사용해야 해서 순수
// 함수·타입만 여기로 뺐다, letters의 archiveItems.ts와 같은 이유).
import { API_URL } from '@/shared/config/apiClient';
export { kstTodayStr } from '@/shared/lib/date';

export interface Article {
  news_id: string;
  title: string;
  published_at: string;
  category: string;
  original_link: string;
  provider?: string;
}

interface RawArticle {
  news_id?: string;
  title?: string;
  published_at?: string;
  category?: string;
  original_link?: string;
  provider?: string;
}

export interface Issue {
  topic: string;
  article_count: number;
  resolved_count: number;
  keywords: string[];
  providers: { total: number; top: { name: string; count: number }[] };
  articles: Article[];
  sedaily: Article | null;
}

export interface Indicator {
  key: string;
  label: string;
  title: string;
  provider: string;
  published_at: string;
  original_link: string;
  has_number: boolean;
}

export type View = 'flat' | 'issues';
export type Source = 's3_xml';

export const ISSUE_COUNT = 8;
export const PER_ISSUE = 3;

// S3 지면 아카이브가 실제로 커버하는 최소 날짜(2026-08-17 실측). 이보다 이전은
// 빅카인즈 issue_ranking으로 대체한다. features/news-feed의 NewsTimeMachineSection.tsx
// 에도 같은 값이 있다 — FSD 레이어 간 import 금지 규칙 때문에 의도적으로 중복.
export const ARCHIVE_MIN_DATE = '2026-02-01';

export interface BigKindsArticle {
  news_id: string;
  title: string;
  content: string;
  byline: string;
  category: string;
  original_link: string | null;
}

/**
 * "그날 이걸 샀다면" 카드 — handlers/config/investment_scenarios.py가 실제
 * 조사한 코스피·비트코인·로또·커피값 시계열로 그 자리에서 계산해 돌려준다
 * (외부 API 호출 없는 순수 계산이라 캐시와 무관하게 매번 최신). 데이터가
 * 없는 구간(예: 1994년 이전 코스피)은 그 카드 자체가 배열에서 빠진다 —
 * 추정치로 채우지 않는다.
 */
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

interface BigKindsDayData {
  articles: BigKindsArticle[];
  investments: InvestmentScenario[];
}

/**
 * 2026-02-01 이전 날짜의 "그날의 서울경제" — handlers/time_machine_handler.py가
 * SSM에 보관된 키로 빅카인즈 뉴스 검색(날짜 범위 + provider=서울경제)을 직접
 * 호출해 돌려준다(1990-01-01~). 발행 "시각"은 이 API가 안 줘서 항상 비어있다.
 */
export async function fetchBigkindsDay(target: string): Promise<BigKindsDayData> {
  try {
    const res = await fetch(`${API_URL}/time-machine?date=${target}`, { cache: 'no-store' });
    if (!res.ok) return { articles: [], investments: [] };
    const data = await res.json();
    return {
      articles: Array.isArray(data?.articles) ? data.articles : [],
      investments: Array.isArray(data?.investments) ? data.investments : [],
    };
  } catch {
    return { articles: [], investments: [] };
  }
}

export function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function kdate(s: string) {
  const [y, m, d] = s.split('-');
  return `${y}년 ${parseInt(m, 10)}월 ${parseInt(d, 10)}일`;
}

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
    }));
}

export interface DayResult {
  list: Article[];
  source: Source;
}

/**
 * 그 날짜 지면을 가져온다 — 서버(SSR)·클라이언트(되감기 애니메이션) 양쪽에서
 * 호출 가능한 순수 fetch. `/api/timeline`은 S3 XML(서울경제 원본 피드) 단일
 * 소스라 폴백이 필요 없다 — 그 날짜에 기사가 없으면 빈 배열을 그대로
 * 반환하고, 화면은 "아직 보관되지 않았어요" 빈 상태로 처리한다
 * (2026-08-13, 빅카인즈+DynamoDB 2단계 폴백 구조 제거).
 */
export async function fetchDayArticles(target: string): Promise<DayResult> {
  try {
    const res = await fetch(`${API_URL}/api/timeline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: target, mode: 'flat', page_size: 30 }),
      cache: 'no-store',
    });
    if (!res.ok) return { list: [], source: 's3_xml' };
    const data = await res.json();
    return { list: toArticles(data?.articles), source: 's3_xml' };
  } catch {
    return { list: [], source: 's3_xml' };
  }
}

export async function fetchIssues(target: string): Promise<{ issues: Issue[]; indicators: Indicator[] }> {
  const res = await fetch(`${API_URL}/api/timeline`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ date: target, mode: 'issues', issue_count: ISSUE_COUNT, per_issue: PER_ISSUE }),
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`timeline issues ${res.status}`);
  const data = await res.json();

  const rawIssues = Array.isArray(data?.issues) ? (data.issues as Partial<Issue>[]) : [];
  const issues: Issue[] = rawIssues
    .filter((i) => i && i.topic)
    .map((i) => ({
      topic: i.topic ?? '',
      article_count: i.article_count ?? 0,
      resolved_count: i.resolved_count ?? 0,
      keywords: Array.isArray(i.keywords) ? i.keywords : [],
      providers: { total: i.providers?.total ?? 0, top: Array.isArray(i.providers?.top) ? i.providers.top : [] },
      articles: toArticles(i.articles),
      sedaily: i.sedaily ? toArticles([i.sedaily])[0] ?? null : null,
    }));

  const rawInds = Array.isArray(data?.indicators) ? (data.indicators as Partial<Indicator>[]) : [];
  const indicators: Indicator[] = rawInds
    .filter((i) => i && i.label && i.title)
    .map((i) => ({
      key: i.key ?? '',
      label: i.label ?? '',
      title: i.title ?? '',
      provider: i.provider ?? '',
      published_at: i.published_at ?? '',
      original_link: i.original_link ?? '',
      has_number: Boolean(i.has_number),
    }));

  return { issues, indicators };
}
