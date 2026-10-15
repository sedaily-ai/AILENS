import { describe, expect, it } from 'vitest';
import type { ArchiveSentenceResponse } from '@/shared/lib/api/archiveApi';
import { sentenceSourceHref } from './drawerModel';
import type { NewsArticle } from './news/newsModel';

const sentence: ArchiveSentenceResponse = { id: 'sentence-a', text: '반도체 투자와 수출 전망', article_id: 'source', article_title: '원문', article_published_at: '2026-10-14', created_at: '2026-10-14' };
const article = (id: string, title: string): NewsArticle => ({ id, title, keywords: [], category: '산업', context: '', date: '2026-10-14', href: `/industry/2026/10/14/${id}` });

describe('문장별 관련 뉴스', () => {
  it('원문 메타데이터가 있으면 정식 기사 주소를 사용하고 없으면 기존 상세 주소를 보존한다', () => {
    expect(sentenceSourceHref(sentence, [article('source', '반도체 원문')], [])).toBe('/industry/2026/10/14/source');
    expect(sentenceSourceHref(sentence, [], [])).toBe('/lens/source');
    expect(sentenceSourceHref({ ...sentence, href: '/lens/canonical' }, [], [])).toBe('/lens/canonical');
    expect(sentenceSourceHref({ ...sentence, href: '//external.invalid' }, [], [])).toBe('/lens/source');
  });
});
