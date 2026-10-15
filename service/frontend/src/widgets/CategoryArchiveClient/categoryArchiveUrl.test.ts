import { expect, it } from 'vitest';
import { categoryArchiveHref, readCategoryArchiveState } from './categoryArchiveUrl';

it('분류·기간·페이지 크기와 페이지를 공유 URL로 왕복하고 기타 쿼리를 보존한다', () => {
  const initial = '/markets?utm_source=test#news';
  const state = { activeSub: '국내증시', dateRange: { from: '2026-10-01', to: '2026-10-15' }, pageSize: 50, page: 2 };
  const href = categoryArchiveHref(initial, '/markets', state);
  expect(readCategoryArchiveState(href, '/markets', ['국내증시'])).toEqual(state);
  expect(href).toContain('/markets/page/2?');
  expect(href).toContain('utm_source=test');
  expect(href).toContain('#news');
  expect(categoryArchiveHref(href, '/markets', { activeSub: 'all', dateRange: null, pageSize: 20, page: 1 })).toBe(initial);
});

it('지원하지 않는 분류·크기·잘못된 날짜·페이지는 안전한 기본값으로 복원한다', () => {
  for (const query of ['from=2026-02-30&to=2026-10-15', 'from=2026-10-15&to=2026-10-01', 'from=invalid', 'to=2026-10-15']) {
    expect(readCategoryArchiveState(`/markets/page/-1?sub=invalid&size=0&${query}`, '/markets', ['국내증시'])).toEqual({ activeSub: 'all', dateRange: null, pageSize: 20, page: 1 });
  }
  expect(readCategoryArchiveState('/markets/page/3?size=100', '/markets', []).page).toBe(3);
});
