import { expect, test, vi } from 'vitest';
import { frontArticleHref } from './birthdayFrontPage';
import {
  frontRequestDate, isPaperlessSunday, loadNewspaperYear, naverArticles, newspaperImageUrl, newspaperYearUrl, parseNewspaperYear, shiftDate, type NewspaperYear,
} from './birthdayNewspaper';

const row = (rank: number, over: Record<string, unknown> = {}) => ({ rank, title: `기사 ${rank}`, url: `https://n.news.naver.com/mnews/article/011/${String(rank).padStart(10, '0')}`, ...over });
const file = (days: Record<string, unknown>, over: Record<string, unknown> = {}) =>
  ({ schema: 1, year: 2026, updated_at: '2026-11-10T06:05:00+09:00', text_covers: [['2026-01-01', '2026-11-03']], days, ...over });

test('사진 주소는 날짜로 정해진다', () => {
  expect(newspaperImageUrl('1995-05-17')).toBe('/timemachine-newspaper/img/1995/05/19950517.jpg');
  expect(newspaperImageUrl('2026-11-03')).toBe('/timemachine-newspaper/img/2026/11/20261103.jpg');
  expect(newspaperYearUrl(2014)).toBe('/timemachine-newspaper/index/v1/2014.json');
});

test('날짜 이동은 달·해를 넘긴다', () => {
  expect(shiftDate('2023-12-31', 1)).toBe('2024-01-01');
  expect(shiftDate('2024-03-01', -1)).toBe('2024-02-29');
});

test('일요일자가 없는 시기의 일요일만 월요일을 묻는다', () => {
  // 1996-09-29부터 일요일자가 없다. 그 전 일요일(1996-09-22)에는 신문이 있었으므로 그대로 묻는다.
  expect(isPaperlessSunday('1996-09-29')).toBe(true);
  expect(isPaperlessSunday('1996-09-22')).toBe(false);
  expect(frontRequestDate('1996-09-29')).toBe('1996-09-30');
  expect(frontRequestDate('1996-09-22')).toBe('1996-09-22');
  expect(frontRequestDate('2024-10-13')).toBe('2024-10-14');
  // 해를 넘기는 일요일
  expect(frontRequestDate('2023-12-31')).toBe('2024-01-01');
  // 일요일이 아니면 생일 그대로
  for (const day of ['2024-10-12', '2024-10-14', '2024-10-15', '2010-05-12']) expect(frontRequestDate(day)).toBe(day);
});

test('연도 파일 읽기 — 순서대로 정렬하고, 형식이 다르면 그 해를 통째로 버린다', () => {
  const parsed = parseNewspaperYear(file({ '2026-11-02': { articles: [row(2), row(1)] } }), 2026);
  expect(parsed?.days['2026-11-02'].map(item => item.rank)).toEqual([1, 2]);
  expect(parsed?.year).toBe(2026);

  expect(parseNewspaperYear(file({}, { year: 2025 }), 2026)).toBeNull();
  expect(parseNewspaperYear(file({}, { schema: 2 }), 2026)).toBeNull();
  expect(parseNewspaperYear(null, 2026)).toBeNull();
  expect(parseNewspaperYear(file({ '2026-1-2': { articles: [row(1)] } }), 2026)).toBeNull();
  expect(parseNewspaperYear(file({ '2026-11-02': { articles: [] } }), 2026)).toBeNull();
  expect(parseNewspaperYear(file({ '2026-11-02': { articles: [row(1, { title: ' ' })] } }), 2026)).toBeNull();
  expect(parseNewspaperYear(file({ '2026-11-02': { articles: [row(0)] } }), 2026)).toBeNull();
  expect(parseNewspaperYear(file({ '2026-11-02': { articles: [row(1.5)] } }), 2026)).toBeNull();
});

test('링크로 걸리는 주소는 https만 받는다', () => {
  for (const url of ['javascript:alert(1)', 'http://n.news.naver.com/a', '//n.news.naver.com/a', '']) {
    expect(parseNewspaperYear(file({ '2026-11-02': { articles: [row(1, { url })] } }), 2026)).toBeNull();
  }
});

test('네이버 기사는 기사 목록이 읽는 모양으로 바뀌고 링크는 네이버 주소 그대로다', () => {
  const [first, second] = naverArticles([{ rank: 1, title: '첫째', url: 'https://n.news.naver.com/a' }, { rank: 2, title: '둘째', url: 'https://n.news.naver.com/b' }]);
  expect(first).toMatchObject({ title: '첫째', content: '', original_link: 'https://n.news.naver.com/a' });
  expect(first.coverage).toBeUndefined();
  expect(first.news_id).not.toBe(second.news_id);
  expect(frontArticleHref(first)).toBe('https://n.news.naver.com/a');
});

// 요청 공유 표는 모듈 수준이라 시험마다 다른 해를 쓴다.
test('같은 해 파일은 한 번만 받고, 없는 해는 기억하지 않는다', async () => {
  const loaded: NewspaperYear = { year: 2031, days: {} };
  const fetcher = vi.fn(async () => loaded);
  const [first, second] = await Promise.all([loadNewspaperYear(2031, fetcher), loadNewspaperYear(2031, fetcher)]);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(second).toBe(first);

  const missing = vi.fn(async () => null);
  expect(await loadNewspaperYear(2032, missing)).toBeNull();
  expect(await loadNewspaperYear(2032, missing)).toBeNull();
  expect(missing).toHaveBeenCalledTimes(2);

  const throwing = vi.fn(async (): Promise<NewspaperYear | null> => { throw new Error('network'); });
  expect(await loadNewspaperYear(2033, throwing)).toBeNull();
});
