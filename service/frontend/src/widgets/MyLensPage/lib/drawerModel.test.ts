import { describe, expect, it } from 'vitest';
import type { ArchiveSentenceResponse } from '@/shared/lib/api/archiveApi';
import { relatedSentenceNews, sentenceSourceHref } from './drawerModel';
import type { NewsArticle } from './news/newsModel';

const sentence: ArchiveSentenceResponse = { id: 'sentence-a', text: '반도체 투자와 수출 전망', article_id: 'source', article_title: '원문', article_published_at: '2026-10-14', created_at: '2026-10-14' };
const article = (id: string, title: string): NewsArticle => ({ id, title, keywords: [], category: '산업', context: '', date: '2026-10-14', href: `/industry/2026/10/14/${id}` });

describe('문장별 관련 뉴스', () => {
  it('선택한 문장의 단어에 맞는 새 글만 보여주고 원문·다른 저장 원문·읽은 글은 제외한다', () => {
    const articles = [article('source', '반도체 원문'), article('archived', '반도체 다른 원문'), article('read', '반도체 읽은 글'), article('new', '반도체 새 글'), article('other', '부동산 새 글')];
    const related = relatedSentenceNews(sentence, articles, [{ id: 'read', kind: 'news', title: '반도체 읽은 글', categories: [], keywords: [] }], ['source', 'archived']);
    expect(related.map((item) => item.id)).toEqual(['new']);
    expect(related[0].reasons).toEqual([{ type: 'sentence', text: '저장 문장의 단어 ‘반도체’ 포함' }]);
  });
  it('관련 결과가 없을 때 최신 뉴스를 관련 뉴스처럼 대체하지 않는다', () => {
    expect(relatedSentenceNews(sentence, [article('other', '부동산 새 글')], [], ['source'])).toEqual([]);
  });
  it('다른 문장을 선택하면 해당 문장의 추천 근거로 바뀐다', () => {
    const selected = { ...sentence, id: 'sentence-b', text: '부동산 가격 전망' };
    expect(relatedSentenceNews(selected, [article('semi', '반도체 소식'), article('home', '부동산 소식')], [], ['source']).map((item) => item.id)).toEqual(['home']);
  });
  it('원문 메타데이터가 있으면 정식 기사 주소를 사용하고 없으면 기존 상세 주소를 보존한다', () => {
    expect(sentenceSourceHref(sentence, [article('source', '반도체 원문')], [])).toBe('/industry/2026/10/14/source');
    expect(sentenceSourceHref(sentence, [], [])).toBe('/lens/source');
    expect(sentenceSourceHref({ ...sentence, href: '/lens/canonical' }, [], [])).toBe('/lens/canonical');
    expect(sentenceSourceHref({ ...sentence, href: '//external.invalid' }, [], [])).toBe('/lens/source');
  });
});
