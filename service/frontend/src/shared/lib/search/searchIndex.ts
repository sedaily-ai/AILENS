// AI LENS 일반 검색 — 가벼운 검색용 목록을 한 번 받아 브라우저에서 바로 거른다(서버 검색 API 없음).
// 검색 대상은 제목·요약·분류까지이다. 기사 본문(4개 형식의 문단·대본)은 넣지 않는다 — 넣으면 목록이 수 MB가 되어 모바일에서 느려진다.
// 글이 만 건 단위로 늘면 서버 검색으로 바꾼다(인터페이스는 search()/loadSearchIndex() 두 개라 호출부는 그대로).

export interface SearchRecord {
  /** lens id(슬러그) */
  i: string;
  /** 제목(표시용으로 정제됨) */
  h: string;
  /** 요약 */
  s: string;
  /** 분류(없으면 빈 문자열) */
  c: string;
  /** 하위 분류 */
  u: string;
  /** 발행일 YYYY-MM-DD */
  d: string;
  /** 발행 시각(ISO), 없으면 빈 문자열 */
  t: string;
  /** 썸네일 URL, 없으면 빈 문자열 */
  p: string;
}

export type SearchScope = 'all' | 'title' | 'summary';
export type SearchSort = 'latest' | 'relevance';
export type SearchPeriod = 'all' | 'today' | 'week' | 'month';

export interface SearchParams {
  q: string;
  scope: SearchScope;
  sort: SearchSort;
  period: SearchPeriod;
  /** 분류 라벨. 빈 문자열이면 전체. UNCATEGORIZED는 미분류. */
  category: string;
}

export const UNCATEGORIZED = '기타';
export const MAX_QUERY_LENGTH = 100;

export const DEFAULT_PARAMS: SearchParams = { q: '', scope: 'all', sort: 'latest', period: 'all', category: '' };

let memo: Promise<SearchRecord[]> | null = null;

/** 검색용 목록. 한 세션에 한 번만 받는다(실패하면 다음에 다시 시도). */
export function loadSearchIndex(): Promise<SearchRecord[]> {
  if (!memo) {
    memo = fetch('/api/search-index')
      .then((r) => {
        if (!r.ok) throw new Error(`search-index ${r.status}`);
        return r.json() as Promise<{ items: SearchRecord[] }>;
      })
      .then((j) => j.items)
      .catch((e) => {
        memo = null;
        throw e;
      });
  }
  return memo;
}

/** 검색 버튼에 손이 가는 순간(호버·포커스·터치) 목록을 미리 받아 둔다. 실패해도 조용히 넘어가고, 열렸을 때 다시 시도한다. */
export function prefetchSearchIndex(): void {
  void loadSearchIndex().catch(() => undefined);
}

/** "대장암, 전립선암  AI" → ['대장암','전립선암','ai']. 쉼표·공백으로 나누고 소문자로 맞춘다. */
export function parseTerms(q: string): string[] {
  return [...new Set(q.slice(0, MAX_QUERY_LENGTH).toLowerCase().split(/[\s,]+/).map((t) => t.trim()).filter(Boolean))];
}

function kstToday(): string {
  return new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 10);
}

function shiftDays(date: string, delta: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

function periodStart(period: SearchPeriod): string | null {
  if (period === 'all') return null;
  const today = kstToday();
  if (period === 'today') return today;
  return shiftDays(today, period === 'week' ? -6 : -29);
}

export interface SearchHit {
  rec: SearchRecord;
  score: number;
}

/** 검색어 중 하나라도 들어 있으면 결과에 넣는다(참조 사이트와 같은 "여러 단어 = 어느 하나라도"). 점수: 제목 3, 요약 1, 모든 단어가 들어 있으면 +2. */
export function search(items: SearchRecord[], params: SearchParams): SearchHit[] {
  const terms = parseTerms(params.q);
  if (terms.length === 0) return [];
  const from = periodStart(params.period);
  const hits: SearchHit[] = [];
  for (const rec of items) {
    if (from && rec.d < from) continue;
    if (params.category) {
      const cat = rec.c || UNCATEGORIZED;
      if (cat !== params.category) continue;
    }
    const title = rec.h.toLowerCase();
    const summary = rec.s.toLowerCase();
    let score = 0;
    let matched = 0;
    for (const t of terms) {
      let hit = false;
      if (params.scope !== 'summary' && title.includes(t)) {
        score += 3;
        hit = true;
      }
      if (params.scope !== 'title' && summary.includes(t)) {
        score += 1;
        hit = true;
      }
      if (hit) matched += 1;
    }
    if (matched === 0) continue;
    if (matched === terms.length && terms.length > 1) score += 2;
    hits.push({ rec, score });
  }
  const byDate = (a: SearchHit, b: SearchHit) => (b.rec.t || b.rec.d).localeCompare(a.rec.t || a.rec.d);
  hits.sort(params.sort === 'relevance' ? (a, b) => b.score - a.score || byDate(a, b) : byDate);
  return hits;
}

/** 분류별 결과 수(탭 숫자용). 분류 필터는 무시하고 나머지 조건만 적용한다. */
export function countByCategory(items: SearchRecord[], params: SearchParams): Map<string, number> {
  const counts = new Map<string, number>();
  for (const h of search(items, { ...params, category: '' })) {
    const cat = h.rec.c || UNCATEGORIZED;
    counts.set(cat, (counts.get(cat) ?? 0) + 1);
  }
  return counts;
}

/** 텍스트를 검색어 기준으로 [{text, hit}] 조각으로 나눈다(강조 표시용, 대소문자 무시). */
export function splitHighlight(text: string, terms: string[]): Array<{ text: string; hit: boolean }> {
  if (terms.length === 0 || !text) return [{ text, hit: false }];
  const escaped = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).sort((a, b) => b.length - a.length);
  // 캡처 그룹이 하나뿐이라 split 결과의 홀수 인덱스가 곧 검색어와 일치한 조각이다.
  return text
    .split(new RegExp(`(${escaped.join('|')})`, 'gi'))
    .map((part, i) => ({ text: part, hit: i % 2 === 1 }))
    .filter((p) => p.text !== '');
}

// ── 요즘 많이 나온 키워드 ─────────────────────────────────────────────
// 실제 검색 로그가 없어서 최근 글 제목에 자주 나온 말을 센다(글 단위로 한 번씩만). 화면에도 "검색 순위"가 아니라고 밝힌다.
const JOSA = /(으로서|으로써|에서는|에게서|까지는|이라고|라고|에서|에게|으로|부터|까지|처럼|보다|이나|이란|이다|하는|하며|했다|한다|된다|됐다|들이|들의|들은|들을|은|는|이|가|을|를|의|에|도|만|과|와|로|라)$/;
const STOP = new Set([
  '이번', '올해', '지난', '내년', '오늘', '어제', '내일', '한편', '가장', '이후', '이상', '이하', '관련', '대한', '위해', '통해', '대해', '따라', '때문', '경우', '여전히', '다시', '이미', '또한', '그리고', '하지만', '등장', '최대', '최고', '최초', '최저', '무려', '사상', '역대', '처음', '다음', '모든', '많은', '있는', '없는', '하는', '되는', '위한', '다른', '같은', '이렇게', '그렇게', '어떻게', '무엇', '누구', '언제', '어디', '왜',
  '만에', '이어', '이어서', '나선', '나서', '앞서', '속에', '가운데',
  // 부서·분류 접두어(제목 머리에 붙는 말) — 주제어가 아니다.
  '금융', '산업', '국제', '사회', '정치', '경제', '생활', '문화',
  '우리', '아니', '분기', '해외', '국내', '정부',
]);
// 문장 끝(동사·형용사 활용형)으로 끝나는 토큰은 주제어가 아니다: 빠졌다고, 있다고, 늘었다 …
const VERB_END = /(다고|라고|이다|다는|라는|는데|지만|으며|하며|했다|됐다|한다|된다|었다|았다|겠다|네요|해요|돼요)$|[가-힣]{2,}다$/;

function stem(token: string): string {
  let t = token;
  for (let i = 0; i < 2; i += 1) {
    const next = t.replace(JOSA, '');
    if (next.length < 2 || next === t) break;
    t = next;
  }
  return t;
}

export function topKeywords(items: SearchRecord[], days = 3, limit = 10): string[] {
  const from = shiftDays(kstToday(), -(days - 1));
  const df = new Map<string, number>();
  for (const rec of items) {
    if (rec.d < from) continue;
    const seen = new Set<string>();
    for (const raw of rec.h.split(/[^0-9A-Za-z가-힣]+/)) {
      if (!raw) continue;
      const t = /[가-힣]/.test(raw) ? stem(raw) : raw.toUpperCase();
      if (t.length < 2 || STOP.has(t) || /^\d/.test(t) || VERB_END.test(t)) continue;
      seen.add(t);
    }
    for (const t of seen) df.set(t, (df.get(t) ?? 0) + 1);
  }
  return [...df.entries()]
    .filter(([, n]) => n >= 2)
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .slice(0, limit)
    .map(([t]) => t);
}
