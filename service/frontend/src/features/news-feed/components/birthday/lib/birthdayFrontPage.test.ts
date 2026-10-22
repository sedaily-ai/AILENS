import { expect, test, vi } from 'vitest';
import { parseFrontPage, type FrontPageData } from '@/shared/lib/api/timelineApi';
import { frontArticleHref, frontNotice, frontPageNotice, loadFrontPage, prefetchFrontPage, shareableFront, weekdayOf, type FrontPageState } from './birthdayFrontPage';

// nb()가 붙인 줄바꿈 없는 공백을 보통 공백으로 바꿔 문장만 비교한다.
const plain = (lines: string[] | undefined) => lines?.map(line => line.replaceAll('\u00a0', ' '));
const article = { news_id: '1', title: '제목', content: '', byline: '', category: '', original_link: null };
const data = (over: Partial<FrontPageData>): FrontPageData =>
  ({ date: '2024-10-13', date_kind: 'front', shown_date: '2024-10-13', kind: 'front', reason: null, basis: null, articles: [article], ...over });

test('서버에 묻지 않는 날짜는 자료가 아예 없는 시기뿐 — 일요일·면 번호 없는 시기도 서버가 대체해 준다', () => {
  expect(frontPageNotice('1960-07-31')).toBe('before-founding');
  expect(frontPageNotice('1988-02-03')).toBe('suspended');
  expect(frontPageNotice('1988-08-01')).toBe('before-archive');
  expect(frontPageNotice('1989-12-31')).toBe('before-archive');
  for (const date of ['1990-01-01', '1993-12-31', '1996-08-01', '2000-03-19', '2010-05-12', '2024-12-08']) expect(frontPageNotice(date)).toBeNull();
});

test('생일 당일 신문이면 면 번호가 있든 없든 안내가 없다', () => {
  expect(frontNotice(data({}))).toBeNull();
  // 면 번호가 없는 시기(kind day)도 생일 당일이면 안내 상자 없이, 고른 기준은 지면 아래 출처 줄에 둔다.
  expect(frontNotice(data({ date: '2010-05-12', date_kind: 'day', shown_date: '2010-05-12', kind: 'day', basis: 'issue' }))).toBeNull();
  expect(frontNotice(data({ date: '2014-04-16', date_kind: 'day', shown_date: '2014-04-16', kind: 'day', basis: 'no_match' }))).toBeNull();
  expect(frontNotice(data({ kind: 'none', shown_date: null, reason: 'archive_missing', articles: [] }))).toBeNull();
});

test('일요일·보관본에 없는 날은 까닭과 대신 보여 주는 신문을 함께 적는다', () => {
  const sunday = frontNotice(data({ shown_date: '2024-10-12', reason: 'sunday' }));
  expect(sunday?.title).toBe('생일에는 신문이 나오지 않았어요');
  expect(plain(sunday?.lines)).toEqual([
    '2024년 10월 13일은 일요일이라 서울경제가 나오지 않았어요.',
    '대신 가장 가까운 지난 신문인 2024년 10월 12일 토요일자 서울경제를 보여 줘요.',
  ]);
  const missing = frontNotice(data({ date: '2025-10-09', shown_date: '2025-10-03', reason: 'no_paper' }));
  expect(missing?.title).toBe('생일 당일 신문을 찾지 못했어요');
  expect(plain(missing?.lines)).toEqual([
    '2025년 10월 9일자 서울경제가 빅카인즈 보관본에 없어요. 명절 등으로 휴간했거나 보관본에서 빠진 날이에요.',
    '대신 가장 가까운 지난 신문인 2025년 10월 3일 금요일자 서울경제를 보여 줘요.',
  ]);
});

test('대신 보여 주는 날짜의 안내는 면 번호 시기와 관계없이 같은 말을 쓴다', () => {
  // 1994-01-01은 면 번호 시기, 보여 주는 1993-12-31은 면 번호가 없는 시기(그날 기사)다. 고른 기준은 출처 줄에 둔다.
  const fallback = frontNotice(data({ date: '1994-01-01', shown_date: '1993-12-31', kind: 'day', reason: 'no_paper', basis: 'issue', articles: [article, article] }));
  expect(fallback?.title).toBe('생일 당일 신문을 찾지 못했어요');
  expect(plain(fallback?.lines)).toEqual([
    '1994년 1월 1일자 서울경제가 빅카인즈 보관본에 없어요. 명절 등으로 휴간했거나 보관본에서 빠진 날이에요.',
    '대신 가장 가까운 지난 신문인 1993년 12월 31일 금요일자 서울경제를 보여 줘요.',
  ]);
  // 1996-08-01은 면 번호가 없는 시기, 보여 주는 1996-07-31은 면 번호 시기다.
  const toFront = frontNotice(data({ date: '1996-08-01', date_kind: 'day', shown_date: '1996-07-31', reason: 'no_paper' }));
  expect(plain(toFront?.lines)).toEqual([
    '1996년 8월 1일자 서울경제가 빅카인즈 보관본에 없어요. 명절 등으로 휴간했거나 보관본에서 빠진 날이에요.',
    '대신 가장 가까운 지난 신문인 1996년 7월 31일 수요일자 서울경제를 보여 줘요.',
  ]);
});

test('생일이 오늘이고 아직 보관본에 없으면 휴간이라고 하지 않는다', () => {
  const today = frontNotice(data({ date: '2026-10-19', shown_date: '2026-10-17', reason: 'not_yet' }));
  expect(today?.title).toBe('오늘 신문은 아직 보관본에 없어요');
  expect(plain(today?.lines)).toEqual([
    '오늘(2026년 10월 19일)자 서울경제가 빅카인즈 보관본에 아직 들어오지 않았어요.',
    '대신 가장 가까운 지난 신문인 2026년 10월 17일 토요일자 서울경제를 보여 줘요.',
  ]);
});

test('응답 읽기 — 새 형식, 구버전 백엔드(롤백 중), 형식 불일치', () => {
  expect(parseFrontPage('2024-10-13', { date: '2024-10-13', date_kind: 'front', shown_date: '2024-10-12', kind: 'front', reason: 'sunday', basis: null, articles: [article], status: 'no_paper' }))
    .toEqual({ date: '2024-10-13', date_kind: 'front', shown_date: '2024-10-12', kind: 'front', reason: 'sunday', basis: null, articles: [article] });
  expect(parseFrontPage('2010-05-12', { kind: 'day', date_kind: 'day', shown_date: '2010-05-12', reason: null, basis: 'issue', articles: [article] })?.basis).toBe('issue');
  // 기준을 모르는 그날 기사는 이슈로 골랐다고 말하지 않는다.
  expect(parseFrontPage('2010-05-12', { kind: 'day', shown_date: '2010-05-12', articles: [article] })?.basis).toBe('no_ranking');
  // 구버전 백엔드는 status만 준다. 당일 1면(ok)만 살리고, 휴간 등은 형식 불일치(오류 화면, 다시 불러오기)로 둔다.
  expect(parseFrontPage('1996-06-01', { status: 'ok', reason: null, articles: [article] }))
    .toEqual({ date: '1996-06-01', date_kind: 'front', shown_date: '1996-06-01', kind: 'front', reason: null, basis: null, articles: [article] });
  expect(parseFrontPage('2024-10-13', { status: 'no_paper', reason: 'sunday', articles: [] })).toBeNull();
  expect(parseFrontPage('2024-10-13', { kind: 'front', shown_date: null, articles: [article] })).toBeNull();
  expect(parseFrontPage('2024-10-13', { kind: 'other' })).toBeNull();
  expect(parseFrontPage('2024-10-13', null)).toBeNull();
  expect(parseFrontPage('1998-07-15', { kind: 'none', date_kind: 'day', shown_date: null, reason: 'archive_missing', articles: [] }))
    .toEqual({ date: '1998-07-15', date_kind: 'day', shown_date: null, kind: 'none', reason: 'archive_missing', basis: null, articles: [] });
});

test('그날 신문 카드에는 생일 당일 kind front 기사만 넣는다', () => {
  const ok = (over: Partial<FrontPageData>): FrontPageState => ({ status: 'ok', date: '2024-10-13', data: data(over) });
  expect(shareableFront(ok({}))).toEqual([article]);
  expect(shareableFront(ok({ shown_date: '2024-10-12', reason: 'sunday' }))).toEqual([]);
  expect(shareableFront(ok({ kind: 'day' }))).toEqual([]);
  expect(shareableFront({ status: 'loading', date: '2024-10-13' })).toEqual([]);
  expect(shareableFront(null)).toEqual([]);
});

// 요청 공유 표는 모듈 수준이라 시험마다 다른 날짜를 쓴다.
test('같은 날짜는 요청을 한 번만 보내고 결과를 함께 쓴다(StrictMode 두 번 실행·미리 요청)', async () => {
  const fetcher = vi.fn(async (date: string) => data({ date, shown_date: date }));
  const [first, second] = await Promise.all([loadFrontPage('2001-02-03', fetcher), loadFrontPage('2001-02-03', fetcher)]);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(second).toBe(first);
  expect(await loadFrontPage('2001-02-03', fetcher)).toBe(first);
  // 날짜가 다르면 따로 묻는다.
  await loadFrontPage('2001-02-04', fetcher);
  expect(fetcher).toHaveBeenCalledTimes(2);
});

test('실패한 요청은 기억하지 않아 다시 불러오기가 새로 묻는다', async () => {
  const failing = vi.fn(async () => null);
  expect(await loadFrontPage('2002-03-04', failing)).toBeNull();
  expect(await loadFrontPage('2002-03-04', failing)).toBeNull();
  expect(failing).toHaveBeenCalledTimes(2);
  const throwing = vi.fn(async (): Promise<FrontPageData | null> => { throw new Error('network'); });
  expect(await loadFrontPage('2002-03-05', throwing)).toBeNull();
  const ok = vi.fn(async (date: string) => data({ date, shown_date: date }));
  expect((await loadFrontPage('2002-03-05', ok))?.date).toBe('2002-03-05');
  expect(ok).toHaveBeenCalledTimes(1);
});

test('미리 요청은 서버에 묻는 날짜만 보내고, 결과 화면 요청과 하나로 묶인다', async () => {
  const fetcher = vi.fn(async (date: string) => data({ date, shown_date: date }));
  prefetchFrontPage('1985-03-02', fetcher);  // 보관본 시작 전 — 안내만 하고 서버에 보내지 않는다
  prefetchFrontPage('1975-06-15', fetcher);
  expect(fetcher).not.toHaveBeenCalled();
  prefetchFrontPage('2003-05-12', fetcher);
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect((await loadFrontPage('2003-05-12', fetcher))?.date).toBe('2003-05-12');
  expect(fetcher).toHaveBeenCalledTimes(1);
});

test('요일과 기사 링크 규칙', () => {
  expect(weekdayOf('2024-10-12')).toBe('토');
  expect(weekdayOf('1993-12-31')).toBe('금');
  expect(frontArticleHref({ original_link: 'https://www.sedaily.com/NewsView/1', news_id: '02100311.1' })).toBe('https://www.sedaily.com/NewsView/1');
  expect(frontArticleHref({ original_link: 'http://www.sednews.com/NewsView/1HSPL12PYM', news_id: '02100311.20160316065137159' })).toBe('https://www.bigkinds.or.kr/v2/news/newsDetailView.do?newsId=02100311.20160316065137159');
  expect(frontArticleHref({ original_link: null, news_id: 'bad' })).toBeNull();
});
