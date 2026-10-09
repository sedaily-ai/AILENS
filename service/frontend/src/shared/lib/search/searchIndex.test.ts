import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { countByCategory, countBySub, DEFAULT_PARAMS, parseTerms, search, splitHighlight, topKeywords, UNCATEGORIZED, type SearchRecord } from './searchIndex';

const rec = (over: Partial<SearchRecord>): SearchRecord => ({ i: 'x', h: '', s: '', c: '', u: '', d: '2026-10-09', t: '', p: '', ...over });

const ITEMS: SearchRecord[] = [
  rec({ i: 'a', h: '대장암 무려 3배 늘었다', s: '2030 암 발병률이 폭증했다', c: '문화', d: '2026-10-09', t: '2026-10-09T00:52:00Z' }),
  rec({ i: 'b', h: '코스피 4000 돌파', s: '반도체 대형주가 이끌었다', c: '증시', d: '2026-10-08', t: '2026-10-08T00:10:00Z' }),
  rec({ i: 'c', h: '삼성전자 반도체 투자 확대', s: '코스피 상승 견인', c: '산업', d: '2026-10-07', t: '2026-10-07T00:10:00Z' }),
  rec({ i: 'd', h: '미분류 기사 반도체', s: '', c: '', d: '2026-09-01' }),
];

describe('parseTerms', () => {
  it('쉼표·공백으로 나누고 소문자로 맞추며 중복을 없앤다', () => {
    expect(parseTerms('  대장암, 전립선암  AI ai')).toEqual(['대장암', '전립선암', 'ai']);
  });
  it('100자까지만 읽는다', () => {
    expect(parseTerms('가'.repeat(150))[0].length).toBe(100);
  });
});

describe('search', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-09T03:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('빈 검색어는 결과 없음', () => {
    expect(search(ITEMS, DEFAULT_PARAMS)).toEqual([]);
  });
  it('제목·요약 어느 쪽이든 맞으면 포함하고 최신순', () => {
    const ids = search(ITEMS, { ...DEFAULT_PARAMS, q: '반도체' }).map((h) => h.rec.i);
    expect(ids).toEqual(['b', 'c', 'd']);
  });
  it('범위=제목이면 요약에만 있는 글은 빠진다', () => {
    const ids = search(ITEMS, { ...DEFAULT_PARAMS, q: '반도체', scope: 'title' }).map((h) => h.rec.i);
    expect(ids).toEqual(['c', 'd']);
  });
  it('정확도순: 제목에 있는 글이 요약에만 있는 글보다 앞', () => {
    const ids = search(ITEMS, { ...DEFAULT_PARAMS, q: '코스피', sort: 'relevance' }).map((h) => h.rec.i);
    expect(ids).toEqual(['b', 'c']);
  });
  it('기간=1주(오늘 포함 7일)는 그보다 오래된 글을 뺀다', () => {
    const ids = search(ITEMS, { ...DEFAULT_PARAMS, q: '반도체', period: 'week' }).map((h) => h.rec.i);
    expect(ids).toEqual(['b', 'c']);
  });
  it('기간=오늘은 오늘(KST) 글만', () => {
    const ids = search(ITEMS, { ...DEFAULT_PARAMS, q: '대장암 코스피', period: 'today' }).map((h) => h.rec.i);
    expect(ids).toEqual(['a']);
  });
  it('여러 단어는 하나라도 맞으면 포함, 모두 맞으면 점수 가산', () => {
    // b·c는 두 단어가 모두 들어 있어 점수가 같고(3+1+2) 동점은 최신순이라 b가 앞, 한 단어만 맞는 d는 마지막.
    const hits = search(ITEMS, { ...DEFAULT_PARAMS, q: '코스피 반도체', sort: 'relevance' });
    expect(hits.map((h) => h.rec.i)).toEqual(['b', 'c', 'd']);
    expect(hits[0].score).toBeGreaterThan(hits[2].score);
  });
  it('분류 필터와 미분류(기타)', () => {
    expect(search(ITEMS, { ...DEFAULT_PARAMS, q: '반도체', category: '증시' }).map((h) => h.rec.i)).toEqual(['b']);
    expect(search(ITEMS, { ...DEFAULT_PARAMS, q: '반도체', category: UNCATEGORIZED }).map((h) => h.rec.i)).toEqual(['d']);
  });
  it('분류별 개수는 분류 필터를 무시하고 센다', () => {
    const counts = countByCategory(ITEMS, { ...DEFAULT_PARAMS, q: '반도체', category: '증시' });
    expect(counts.get('증시')).toBe(1);
    expect(counts.get('산업')).toBe(1);
    expect(counts.get(UNCATEGORIZED)).toBe(1);
  });
});

describe('하위 분류', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-09T03:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());
  const subs: SearchRecord[] = [
    rec({ i: 'p1', h: '삼성전자 반도체 호황', c: '산업', u: '대기업', d: '2026-10-09' }),
    rec({ i: 'p2', h: '반도체 장비 중소기업', c: '산업', u: '중기·IT', d: '2026-10-08' }),
    rec({ i: 'p3', h: '반도체 주가 급등', c: '시그널', u: '국내증시', d: '2026-10-07' }),
    rec({ i: 'p4', h: '반도체 슈퍼사이클', c: '산업', u: '', d: '2026-10-06' }),
  ];
  it('sub 필터는 그 하위 분류만 남긴다', () => {
    const ids = search(subs, { ...DEFAULT_PARAMS, q: '반도체', category: '산업', sub: '대기업' }).map((h) => h.rec.i);
    expect(ids).toEqual(['p1']);
  });
  it('하위 분류별 개수는 sub 필터를 무시하고 센다(하위 없는 글은 세지 않는다)', () => {
    const counts = countBySub(subs, { ...DEFAULT_PARAMS, q: '반도체', category: '산업', sub: '대기업' });
    expect([...counts.entries()].sort()).toEqual([['대기업', 1], ['중기·IT', 1]]);
  });
  it('대분류를 고르지 않으면 하위 개수를 세지 않는다', () => {
    expect(countBySub(subs, { ...DEFAULT_PARAMS, q: '반도체' }).size).toBe(0);
  });
  it('분류별 개수는 하위 분류 필터를 무시한다', () => {
    const counts = countByCategory(subs, { ...DEFAULT_PARAMS, q: '반도체', category: '산업', sub: '대기업' });
    expect(counts.get('산업')).toBe(3);
    expect(counts.get('시그널')).toBe(1);
  });
});

describe('splitHighlight', () => {
  it('검색어와 일치한 조각을 표시한다(대소문자 무시)', () => {
    expect(splitHighlight('AI 반도체 AI', ['ai'])).toEqual([
      { text: 'AI', hit: true },
      { text: ' 반도체 ', hit: false },
      { text: 'AI', hit: true },
    ]);
  });
  it('특수문자가 들어간 검색어도 안전하다', () => {
    expect(splitHighlight('가격(상승) 소식', ['(상승)'])).toEqual([
      { text: '가격', hit: false },
      { text: '(상승)', hit: true },
      { text: ' 소식', hit: false },
    ]);
  });
  it('검색어가 없으면 그대로', () => {
    expect(splitHighlight('텍스트', [])).toEqual([{ text: '텍스트', hit: false }]);
  });
});

describe('topKeywords', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-09T03:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());
  it('최근 며칠 제목에 두 글 이상 나온 말을 많은 순으로(조사 제거)', () => {
    const items = [
      rec({ h: '반도체는 호황 코스피도 상승' }),
      rec({ h: '반도체가 이끈 증시' }),
      rec({ h: '반도체를 사는 외국인', d: '2026-10-08' }),
      rec({ h: '오래된 반도체 기사', d: '2026-09-01' }),
    ];
    expect(topKeywords(items)[0]).toBe('반도체');
  });
  it('동사형·숫자로 시작하는 말·부서 접두어는 제외', () => {
    const items = [rec({ h: '금융 3분기 빠졌다고 반도체' }), rec({ h: '금융 3분기 빠졌다고 반도체' })];
    expect(topKeywords(items)).toEqual(['반도체']);
  });
  it('불용어·한 글자·숫자만은 제외', () => {
    const items = [rec({ h: '이번 2026 관련 소식' }), rec({ h: '이번 2026 관련 뉴스' })];
    expect(topKeywords(items)).toEqual([]);
  });
});
