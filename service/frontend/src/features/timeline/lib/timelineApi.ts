// 타임라인(뉴스 타임머신) 데이터 계층 — NewsTimeMachine.tsx(인터랙티브 입력+되감기
// 애니메이션)와 app/timeline/[date]/page.tsx(날짜별 SSR 결과 페이지) 양쪽이
// 같이 쓴다. 원래 NewsTimeMachine.tsx 안에 있던 걸 분리했다(2026-08-12,
// "날짜별 고유 URL이 있어야 검색엔진이 하루하루를 색인할 수 있다"는 GEO
// 감사 결론 — 서버 컴포넌트에서도 같은 fetch 로직을 재사용해야 해서 순수
// 함수·타입만 여기로 뺐다, letters의 archiveItems.ts와 같은 이유).
import { API_URL } from '@/shared/config/api';
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
export type Source = 'bigkinds' | 'dynamodb' | 'mock';

export const ISSUE_COUNT = 8;
export const PER_ISSUE = 3;

export const MOCK_FALLBACK: Article[] = [
  { news_id: 'm1', title: '한국은행, 기준금리 0.25%p 인하 결정', published_at: '', category: '경제', original_link: '#' },
  { news_id: 'm2', title: '반도체 수출 48%↑…회복 흐름 속 고용은 16개월 만 최저', published_at: '', category: '경제', original_link: '#' },
  { news_id: 'm3', title: '국고채 3년물 3.766%…정부 구두개입에도 약세', published_at: '', category: '경제', original_link: '#' },
  { news_id: 'm4', title: '서울 아파트값 0.28% 상승…강남 12주 만에 플러스', published_at: '', category: '부동산', original_link: '#' },
];

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
  degraded?: string;
}

/**
 * 그 날짜 지면을 가져온다 — 서버(SSR)·클라이언트(되감기 애니메이션) 양쪽에서
 * 호출 가능한 순수 fetch. 1순위 `/api/timeline`(빅카인즈), 실패 시 `/api/search`
 * 로 폴백(기존 NewsTimeMachine.tsx 동작 그대로 보존).
 */
export async function fetchDayArticles(target: string): Promise<DayResult> {
  let degraded = '';
  try {
    const res = await fetch(`${API_URL}/api/timeline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ date: target, mode: 'flat', page_size: 30 }),
      cache: 'no-store',
    });
    if (res.ok) {
      const data = await res.json();
      const list = toArticles(data?.articles);
      if (list.length) {
        return { list, source: data?.source === 'bigkinds' ? 'bigkinds' : 'dynamodb' };
      }
      degraded = '타임라인 API가 그 날짜에 기사를 주지 않았어요.';
    } else {
      degraded = `타임라인 API 응답 ${res.status}`;
    }
  } catch (e) {
    degraded = `타임라인 API에 연결하지 못했어요 (${e instanceof Error ? e.message : '네트워크'})`;
  }

  const next = new Date(target);
  next.setDate(next.getDate() + 1);
  try {
    const res = await fetch(`${API_URL}/api/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query: '*',
        filters: { published_from: target, published_until: ymd(next) },
        page: 1,
        page_size: 30,
      }),
      cache: 'no-store',
    });
    const data = await res.json();
    return { list: toArticles(data?.articles), source: 'dynamodb', degraded: degraded || '타임라인 API를 쓸 수 없어요.' };
  } catch {
    return { list: [], source: 'dynamodb', degraded: degraded || '타임라인 API를 쓸 수 없어요.' };
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
