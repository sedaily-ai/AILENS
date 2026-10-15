import { expect, it, vi } from 'vitest';
vi.mock('@/shared/lib/api/cmsPostsApi', () => ({
  fetchCmsPosts: vi.fn(async () => [{ id: 'legacy', keywords: [{ term: 'EPC', explain: '짧은 설명' }] }]),
  fetchLensPosts: vi.fn(async () => [{ id: 'article', date: '2026-10-15', category: '산업', lenses: [
    { keywords: [{ term: ' EPC ', explain: '설계·조달·시공을 일괄 수행하는 방식' }, { term: 'SMR', explain: '소형 원자로' }] },
    {},
  ] }]),
}));
import { fetchTerms } from './words';
it('collects new article terms, deduplicates legacy terms and preserves the canonical source', async () => {
  expect(await fetchTerms()).toEqual([
    { term: 'EPC', explain: '설계·조달·시공을 일괄 수행하는 방식', href: '/industry/2026/10/15/article' },
    { term: 'SMR', explain: '소형 원자로', href: '/industry/2026/10/15/article' },
  ]);
});
