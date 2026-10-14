import { describe, expect, it } from 'vitest';
import { buildNewsProfile, mergeNewsEvidence, parseNewsArticles, recommendNews, type NewsArticle, type NewsEvidence } from './newsModel';

const record: NewsEvidence = { id: 'read-a', kind: 'news', title: '읽은 글', categories: ['증시', '시그널'], keywords: ['반도체', '반도체'] };
const article = (id: string, category: string, title = '반도체 투자 소식'): NewsArticle => ({ id, title, category, context: '', date: '2026-10-14', keywords: [], href: `/lens/${id}` });

describe('뉴스·키워드·저장 문장 기반 추천', () => {
  it('현재 축약 목록에서는 제목·요약에 없는 본문 용어를 추천 근거로 만들지 않는다', () => {
    // 실제 shape_lens_summary 계약: label/question/bullets만 남고 keywords는 없다.
    const parsed = parseNewsArticles({ posts: [
      { id: 'summary-only', headline: '기업 투자 소식', context: '공급망 변화', category: '산업', date: '2026-10-14', lenses: [{ label: '읽기', question: '무슨 변화인가요?', bullets: [] }] },
      { id: 'summary-match', headline: '반도체 투자 소식', category: '산업', date: '2026-10-14', lenses: [{ label: '읽기', question: '', bullets: [] }] },
    ] });
    const profile = buildNewsProfile([record], [], []);
    expect(parsed.every((item) => item.keywords.length === 0)).toBe(true);
    const ranked = recommendNews(parsed, [record], profile, [], []);
    expect(ranked.find((item) => item.id === 'summary-only')?.reasons).toEqual([]);
    expect(ranked.find((item) => item.id === 'summary-match')?.reasons.map((reason) => reason.type)).toEqual(['keyword']);
  });
  it('직접 고른 주제는 관찰한 키워드와 구분해 추천한다', () => {
    const profile = buildNewsProfile([], [], []);
    expect(recommendNews([article('new', '산업')], [], profile, [], [], ['반도체'])[0].reasons).toEqual([{ type: 'keyword', text: '직접 선택한 주제 ‘반도체’ 포함' }]);
  });
  it('중복 기록과 옛 카테고리 이름으로 관심 횟수를 부풀리지 않는다', () => {
    const evidence = mergeNewsEvidence([record, record], [], []);
    const profile = buildNewsProfile(evidence, [], []);
    expect(profile.categories).toEqual([{ slug: 'markets', label: '시그널', count: 1 }]);
    expect(profile.keywords).toEqual([{ label: '반도체', count: 1 }]);
  });
  it('한 편만 열람하면 자주 본 분야라고 단정하지 않는다', () => {
    const profile = buildNewsProfile([record], [], []);
    expect(recommendNews([article('new', '시그널')], [record], profile, [], [])[0].reasons[0].text).toContain('열람한 ‘시그널’');
    expect(recommendNews([article('new', '시그널')], [record], profile, [], [])[0].reasons[0].text).not.toContain('자주');
  });
  it('저장한 문장의 단어 일치와 직접 선택을 별도의 근거로 보존한다', () => {
    const profile = buildNewsProfile([], [{ text: '반도체 수출이 늘었다.' }], ['반도체']);
    const picked = recommendNews([article('match', '산업'), article('none', '문화', '전시 소식')], [], profile, ['industry'], []);
    expect(picked[0].reasons.map((item) => item.type)).toEqual(['category', 'sentence']);
    expect(picked[0].reasons[1].text).toContain('반도체');
    expect(picked[1].reasons).toEqual([]);
  });
  it('읽은 기사와 문장을 저장한 원문 기사를 추천에서 제외한다', () => {
    const profile = buildNewsProfile([record], [], []);
    expect(recommendNews([article('read-a', '시그널'), article('saved', '산업'), article('new', '산업')], [record], profile, [], ['saved']).map((item) => item.id)).toEqual(['new']);
  });
  it('키워드가 없는 기사와 비정상 API 응답으로 근거를 만들지 않는다', () => {
    expect(parseNewsArticles({ posts: [{ id: 'bad', headline: '제목', date: 'invalid' }] })).toEqual([]);
    const parsed = parseNewsArticles({ posts: [{ id: 'valid', headline: '공개 제목', category: '산업', date: '2026-10-14', lenses: [] }] });
    expect(parsed[0].keywords).toEqual([]);
    expect(parsed[0].href).toBe('/industry/2026/10/14/valid');
  });
});
