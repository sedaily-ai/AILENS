import { describe, expect, it } from 'vitest';
import type { IssueLetter } from '@/features/letter';
import { mergeLetters } from './dashboardModel';

function letter(slug: string, overrides: Partial<IssueLetter> = {}): IssueLetter {
  return { slug, issueNumber: 1, title: slug, deck: '', axisLabels: [], categories: ['산업'], publishedAt: '2026-10-14', summary: [], sections: [], editorNote: '', vote: null, sources: [], ...overrides };
}

describe('나의 LENS 추천과 기록', () => {
  it('피드와 목록의 중복을 제거하며 원래 에디터·정확한 발행 시각과 추천 이유를 모두 보존한다', () => {
    const merged = mergeLetters([letter('a', { publishedAt: '2026-10-14T11:20', editors: ['mincheol'] })], [letter('a', { reason: '관심 주제 반도체' }), letter('older')]);
    expect(merged).toHaveLength(2);
    expect(merged[0]).toMatchObject({ slug: 'a', publishedAt: '2026-10-14T11:20', editors: ['mincheol'], reason: '관심 주제 반도체' });
  });
});
