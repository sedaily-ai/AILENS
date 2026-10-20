import { describe, expect, it, vi } from 'vitest';
vi.mock('@/entities/user', () => ({ useAuth: () => ({}) }));
vi.mock('../data/accountApi', () => ({}));
import { bookmarkLetter } from './useLetterShelf';
import type { AccountBookmark } from '../data/accountApi';

const bookmark: AccountBookmark = { letter_id: '1', saved_at: '2026-10-20T00:00:00Z', version: 1,
  content: { content_key: 'issue_letter:1', kind: 'issue_letter', available: true, slug: 'older-letter',
    title: '오래전에 저장한 레터', published_at: '2026-10-15T23:02:00+00:00', categories: ['industry'], editors: ['mincheol', 'haeun'] } };

describe('공개 최신 목록에 없는 저장 레터', () => {
  it('계정 응답만으로 실제 작성자, 한국 시각과 분야 이름을 보존한다', () => {
    expect(bookmarkLetter(bookmark)[0]).toMatchObject({ slug: 'older-letter', editors: ['mincheol', 'haeun'],
      publishedAt: '2026-10-16T08:02', categories: ['산업'] });
  });
  it('비공개 레터는 표시하지 않고 작성자가 없는 옛 응답은 추정하지 않는다', () => {
    expect(bookmarkLetter({ ...bookmark, content: { ...bookmark.content, available: false } })).toEqual([]);
    expect(bookmarkLetter({ ...bookmark, content: { ...bookmark.content, editors: undefined } })[0].editors).toEqual([]);
  });
});
