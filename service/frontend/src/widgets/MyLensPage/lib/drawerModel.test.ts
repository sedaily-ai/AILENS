import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ArchiveSentenceResponse } from '@/shared/lib/api/archiveApi';
import { pickDiscoverySentence, sentenceSourceHref } from './drawerModel';
import type { NewsArticle } from './news/newsModel';

const sentence: ArchiveSentenceResponse = { id: 'sentence-a', text: '반도체 투자와 수출 전망', article_id: 'source', article_title: '원문', article_published_at: '2026-10-14', created_at: '2026-10-14' };
const article = (id: string, title: string): NewsArticle => ({ id, title, keywords: [], category: '산업', context: '', date: '2026-10-14', href: `/industry/2026/10/14/${id}` });

afterEach(() => vi.restoreAllMocks());

describe('저장 문장 무작위 재발견', () => {
  const rows = ['a', 'b', 'c'].map((id) => ({ ...sentence, id }));
  it('문장이 없으면 빈 상태이고 한 개면 같은 문장을 계속 보여준다', () => {
    expect(pickDiscoverySentence([], null)).toBeUndefined();
    expect(pickDiscoverySentence([rows[0]], 'a')).toBe(rows[0]);
  });
  it('둘이면 번갈아 표시하고 셋 이상도 직전 문장은 제외한다', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(pickDiscoverySentence(rows.slice(0, 2), 'a')?.id).toBe('b');
    expect(pickDiscoverySentence(rows.slice(0, 2), 'b')?.id).toBe('a');
    expect(pickDiscoverySentence(rows, 'a')?.id).toBe('b');
    vi.mocked(Math.random).mockReturnValue(0.999);
    expect(pickDiscoverySentence(rows, 'a')?.id).toBe('c');
  });
  it('직전 문장이 삭제됐으면 남은 후보 전체에서 뽑고 입력 순서는 바꾸지 않는다', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999);
    expect(pickDiscoverySentence(rows, 'deleted')?.id).toBe('c');
    expect(rows.map((row) => row.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('저장 문장의 원문 주소', () => {
  it('원문 메타데이터가 있으면 정식 기사 주소를 사용하고 없으면 기존 상세 주소를 보존한다', () => {
    expect(sentenceSourceHref(sentence, [article('source', '반도체 원문')], [])).toBe('/industry/2026/10/14/source');
    expect(sentenceSourceHref(sentence, [], [])).toBe('/lens/source');
    expect(sentenceSourceHref({ ...sentence, href: '/lens/canonical' }, [], [])).toBe('/lens/canonical');
    expect(sentenceSourceHref({ ...sentence, href: '//external.invalid' }, [], [])).toBe('/lens/source');
  });
});
