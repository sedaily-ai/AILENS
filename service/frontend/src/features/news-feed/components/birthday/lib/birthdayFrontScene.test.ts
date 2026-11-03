import { expect, test, vi } from 'vitest';
import type { FrontPageData } from '@/shared/lib/api/timelineApi';
import { loadFrontScene } from './birthdayFrontPage';
import type { NewspaperYear } from './birthdayNewspaper';

const article = { news_id: '1', title: '제목', content: '', byline: '', category: '', original_link: null };
const served = (over: Partial<FrontPageData>): FrontPageData =>
  ({ date: '2024-10-14', date_kind: 'front', shown_date: '2024-10-14', kind: 'front', reason: null, basis: null, articles: [article], ...over });
const rows = (title: string) => [{ rank: 1, title, url: 'https://n.news.naver.com/a' }];
const year = (n: number, days: NewspaperYear['days']): NewspaperYear => ({ year: n, days });

function deps(front: FrontPageData | null, years: Record<number, NewspaperYear | null> = {}) {
  return {
    front: vi.fn<(date: string) => Promise<FrontPageData | null>>(async () => front),
    year: vi.fn(async (n: number) => years[n] ?? null),
  };
}

test('일요일(일요일자가 없는 시기)은 월요일을 묻고, 월요일자가 있으면 그 목록을 붙인다', async () => {
  const d = deps(served({}), { 2024: year(2024, { '2024-10-14': rows('월요일 톱') }) });
  const scene = await loadFrontScene('2024-10-13', d, true);
  expect(d.front).toHaveBeenCalledWith('2024-10-14');
  expect(scene?.naver?.[0].title).toBe('월요일 톱');
  // 서버 답은 생일 기준으로 읽는다: 날짜는 생일, 대신 보여 주는 까닭은 일요일.
  expect(scene?.data).toMatchObject({ date: '2024-10-13', shown_date: '2024-10-14', reason: 'sunday' });
});

test('월요일자가 없으면 서버가 고른 토요일의 목록을 붙인다', async () => {
  const d = deps(served({ shown_date: '2024-10-12', reason: 'no_paper' }), { 2024: year(2024, { '2024-10-12': rows('토요일 톱') }) });
  const scene = await loadFrontScene('2024-10-13', d, true);
  expect(scene?.naver?.[0].title).toBe('토요일 톱');
  expect(scene?.data.reason).toBe('sunday');
});

test('오늘이 월요일이라 아직 보관본에 없어도 일요일 생일은 일요일이라 없는 것이다', async () => {
  const d = deps(served({ shown_date: '2024-10-12', reason: 'not_yet' }));
  expect((await loadFrontScene('2024-10-13', d, true))?.data.reason).toBe('sunday');
});

test('일요일이 아니면 생일 그대로 묻고 서버 답을 바꾸지 않는다', async () => {
  const data = served({ date: '2024-10-15', shown_date: '2024-10-15' });
  const d = deps(data, { 2024: year(2024, { '2024-10-15': rows('톱') }) });
  const scene = await loadFrontScene('2024-10-15', d, true);
  expect(d.front).toHaveBeenCalledWith('2024-10-15');
  expect(scene?.data).toBe(data);
  expect(scene?.naver).toHaveLength(1);
});

test('명절이라 며칠 전 신문이 나오면 그 날짜의 목록을 붙인다', async () => {
  const data = served({ date: '2025-10-09', shown_date: '2025-10-03', reason: 'no_paper' });
  const d = deps(data, { 2025: year(2025, { '2025-10-03': rows('금요일 톱') }) });
  const scene = await loadFrontScene('2025-10-09', d, true);
  expect(scene?.naver?.[0].title).toBe('금요일 톱');
  expect(scene?.data.reason).toBe('no_paper');
});

test('네이버 목록이 없는 시기(2011-07-09 전)는 연도 파일을 받지 않는다', async () => {
  const d = deps(served({ date: '2010-05-12', shown_date: '2010-05-12', kind: 'day', date_kind: 'day', basis: 'issue' }));
  const scene = await loadFrontScene('2010-05-12', d, true);
  expect(d.year).not.toHaveBeenCalled();
  expect(scene?.naver).toBeNull();
});

test('연도 파일이 없거나 그날이 없으면 목록 없이(빅카인즈로) 보여 준다 — 실패가 아니다', async () => {
  const day = served({ date: '2015-01-02', shown_date: '2015-01-02' });
  expect((await loadFrontScene('2015-01-02', deps(day), true))?.naver).toBeNull();
  const other = deps(day, { 2015: year(2015, { '2015-01-05': rows('다른 날') }) });
  const scene = await loadFrontScene('2015-01-02', other, true);
  expect(scene?.naver).toBeNull();
  expect(scene?.data).toBe(day);
});

test('보여 줄 신문이 없으면(kind none) 목록을 붙이지 않는다', async () => {
  const none = served({ kind: 'none', shown_date: null, reason: 'archive_missing', articles: [] });
  const d = deps(none, { 2024: year(2024, { '2024-10-14': rows('톱') }) });
  const scene = await loadFrontScene('2024-10-13', d, true);
  expect(scene?.naver).toBeNull();
  expect(scene?.data).toMatchObject({ date: '2024-10-13', kind: 'none', reason: 'archive_missing' });
});

test('해를 넘기는 일요일 — 요청한 해와 보여 줄 날짜의 해가 다르면 그 해 파일을 따로 받는다', async () => {
  // 2023-12-31은 일요일이라 2024-01-01을 묻는다. 월요일(새해 첫날)과 토요일이 없어 금요일(2023-12-29)이 나온 경우.
  const data = served({ date: '2024-01-01', shown_date: '2023-12-29', reason: 'no_paper' });
  const d = deps(data, { 2023: year(2023, { '2023-12-29': rows('금요일 톱') }) });
  const scene = await loadFrontScene('2023-12-31', d, true);
  expect(d.front).toHaveBeenCalledWith('2024-01-01');
  expect(d.year).toHaveBeenCalledWith(2024);
  expect(d.year).toHaveBeenCalledWith(2023);
  expect(scene?.naver?.[0].title).toBe('금요일 톱');
});

test('서버 요청이 실패하면 null — 연도 파일이 있어도 오류 화면이 맞다', async () => {
  const d = deps(null, { 2024: year(2024, { '2024-10-14': rows('톱') }) });
  expect(await loadFrontScene('2024-10-13', d, true)).toBeNull();
});

test('신문 장면이 꺼져 있으면 지금처럼 생일 그대로 묻고 연도 파일을 받지 않는다', async () => {
  const data = served({ date: '2024-10-13', shown_date: '2024-10-12', reason: 'sunday' });
  const d = deps(data, { 2024: year(2024, { '2024-10-12': rows('톱') }) });
  const scene = await loadFrontScene('2024-10-13', d, false);
  expect(d.front).toHaveBeenCalledWith('2024-10-13');
  expect(d.year).not.toHaveBeenCalled();
  expect(scene).toEqual({ data, naver: null });
  expect(await loadFrontScene('2024-10-13', deps(null), false)).toBeNull();
});
