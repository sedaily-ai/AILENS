import { describe, expect, it } from 'vitest';
import type { IssueLetter } from '@/features/letter';
import { mergeLetters, readingCategories, recommendLetters } from './dashboardModel';

function letter(slug: string, overrides: Partial<IssueLetter> = {}): IssueLetter {
  return { slug, issueNumber: 1, title: slug, deck: '', axisLabels: [], categories: ['산업'], publishedAt: '2026-10-14', readMinutes: 3, summary: [], sections: [], editorNote: '', vote: null, sources: [], ...overrides };
}

describe('나의 LENS 추천과 기록', () => {
  it('시간 제한을 합계에 적용하며 긴 추천 한 편 때문에 짧은 레터를 누락하지 않는다', () => {
    const picked = recommendLetters([letter('long', { readMinutes: 8, reason: '관심 주제' }), letter('a'), letter('b', { readMinutes: 2 })], [], [], [], 5);
    expect(picked.map((item) => item.slug)).toEqual(['a', 'b']);
    expect(picked.reduce((total, item) => total + item.readMinutes, 0)).toBe(5);
    expect(recommendLetters([letter('long', { readMinutes: 8 })], [], [], [], 5)).toEqual([]);
  });
  it('공통 최신 레터보다 실제 관심 카테고리와 겹치는 레터를 우선한다', () => {
    const picked = recommendLetters([letter('recent', { categories: ['문화'] }), letter('mine', { publishedAt: '2026-10-12' })], [{ type: 'category', key: 'industry' }], [], [], 0);
    expect(picked[0].slug).toBe('mine');
    expect(picked[0].reason).toContain('산업');
    expect(picked[1].reason).toBe('최근 발행된 레터예요');
  });
  it('카테고리 구 명칭을 인식하고 기록이 없는 레터로 이용 이력을 만들지 않는다', () => {
    const categories = readingCategories([letter('a', { categories: ['증시'] }), letter('b'), letter('c', { categories: ['금융·정책'] })], ['a', 'c', 'unavailable']);
    expect(categories.map(({ slug, count }) => [slug, count])).toEqual([['markets', 1], ['finance', 1]]);
    expect(readingCategories([letter('a')], [])).toEqual([]);
  });
  it('피드와 목록의 중복을 제거하며 원래 에디터·정확한 발행 시각과 추천 이유를 모두 보존한다', () => {
    const merged = mergeLetters([letter('a', { publishedAt: '2026-10-14T11:20', editors: ['mincheol'] })], [letter('a', { reason: '관심 주제 반도체' }), letter('older')]);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({ slug: 'a', publishedAt: '2026-10-14T11:20', editors: ['mincheol'], reason: '관심 주제 반도체' });
  });
  it('명시된 에디터만 팔로우 추천의 근거로 삼는다', () => {
    const picked = recommendLetters([letter('inferred'), letter('explicit', { editors: ['mincheol'] })], [], ['mincheol'], [], 0);
    expect(picked[0].reason).toBe('팔로우한 에디터가 쓴 레터예요');
    expect(picked[1].reason).toBe('최근 발행된 레터예요');
  });
});
