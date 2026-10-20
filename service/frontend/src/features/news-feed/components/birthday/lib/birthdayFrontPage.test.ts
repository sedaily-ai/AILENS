import { expect, test } from 'vitest';
import type { FrontPageData } from '@/shared/lib/api/timelineApi';
import { frontArticleHref, frontNotice, frontPageNotice, shareableFront, weekdayOf, type FrontPageState } from './birthdayFrontPage';

// nb()가 붙인 줄바꿈 없는 공백을 보통 공백으로 바꿔 문장만 비교한다.
const plain = (lines: string[] | undefined) => lines?.map(line => line.replaceAll('\u00a0', ' '));
const article = { news_id: '1', title: '제목', content: '', byline: '', category: '', original_link: null };
const data = (over: Partial<FrontPageData>): FrontPageData =>
  ({ date: '2024-10-13', shown_date: '2024-10-13', kind: 'front', reason: null, articles: [article], ...over });

test('서버에 묻지 않는 날짜는 자료가 아예 없는 시기뿐 — 일요일·면 번호 없는 시기도 서버가 대체해 준다', () => {
  expect(frontPageNotice('1960-07-31')).toBe('before-founding');
  expect(frontPageNotice('1988-02-03')).toBe('suspended');
  expect(frontPageNotice('1988-08-01')).toBe('before-archive');
  expect(frontPageNotice('1989-12-31')).toBe('before-archive');
  for (const date of ['1990-01-01', '1993-12-31', '1996-08-01', '2000-03-19', '2010-05-12', '2024-12-08']) expect(frontPageNotice(date)).toBeNull();
});

test('생일 당일 1면이면 안내가 없다', () => {
  expect(frontNotice(data({}))).toBeNull();
  expect(frontNotice(data({ kind: 'none', shown_date: null, reason: 'archive_missing', articles: [] }))).toBeNull();
});

test('일요일·보관본에 없는 날은 까닭과 대신 보여 주는 신문을 함께 적는다', () => {
  const sunday = frontNotice(data({ shown_date: '2024-10-12', reason: 'sunday' }));
  expect(sunday?.title).toBe('생일에는 신문이 나오지 않았어요');
  expect(plain(sunday?.lines)).toEqual([
    '2024년 10월 13일은 일요일이라 서울경제가 나오지 않았어요.',
    '대신 가장 가까운 지난 신문인 2024년 10월 12일 토요일자 1면을 보여 줘요.',
  ]);
  const missing = frontNotice(data({ date: '2025-10-09', shown_date: '2025-10-03', reason: 'no_paper' }));
  expect(missing?.title).toBe('생일 당일 신문을 찾지 못했어요');
  expect(plain(missing?.lines)).toEqual([
    '2025년 10월 9일자 서울경제 1면이 빅카인즈 보관본에 없어요. 명절 등으로 휴간했거나 보관본에서 빠진 날이에요.',
    '대신 가장 가까운 지난 신문인 2025년 10월 3일 금요일자 1면을 보여 줘요.',
  ]);
});

test('면 번호가 없는 시기는 1면이 아니라 본문이 긴 기사라고 밝힌다', () => {
  const four = [article, article, article, article];
  const sameDay = frontNotice(data({ date: '2010-05-12', shown_date: '2010-05-12', kind: 'day', articles: four }));
  expect(sameDay?.title).toBe('이 시기는 1면 기록이 없어요');
  expect(plain(sameDay?.lines)).toEqual(['빅카인즈 보관본에는 이 무렵 신문이 몇 면에 실렸는지 기록이 없어요. 그래서 1면 대신 그날 서울경제 기사 중 본문이 긴 4건을 보여 줘요.']);
  const fallback = frontNotice(data({ date: '1994-01-01', shown_date: '1993-12-31', kind: 'day', reason: 'no_paper', articles: [article, article] }));
  expect(fallback?.title).toBe('생일 당일 신문을 찾지 못했어요');
  expect(plain(fallback?.lines)).toEqual([
    '1994년 1월 1일자 서울경제가 빅카인즈 보관본에 없어요. 명절 등으로 휴간했거나 보관본에서 빠진 날이에요.',
    '대신 가장 가까운 지난 신문인 1993년 12월 31일 금요일자 기사를 보여 줘요.',
    '이 무렵 신문은 몇 면에 실린 기사인지 기록이 없어, 1면 대신 본문이 긴 기사 2건을 골랐어요.',
  ]);
});

test('공유 카드에는 생일 당일 1면만 넣는다', () => {
  const ok = (over: Partial<FrontPageData>): FrontPageState => ({ status: 'ok', date: '2024-10-13', data: data(over) });
  expect(shareableFront(ok({}))).toEqual([article]);
  expect(shareableFront(ok({ shown_date: '2024-10-12', reason: 'sunday' }))).toEqual([]);
  expect(shareableFront(ok({ kind: 'day' }))).toEqual([]);
  expect(shareableFront({ status: 'loading', date: '2024-10-13' })).toEqual([]);
  expect(shareableFront(null)).toEqual([]);
});

test('요일과 기사 링크 규칙', () => {
  expect(weekdayOf('2024-10-12')).toBe('토');
  expect(weekdayOf('1993-12-31')).toBe('금');
  expect(frontArticleHref({ original_link: 'https://www.sedaily.com/NewsView/1', news_id: '02100311.1' })).toBe('https://www.sedaily.com/NewsView/1');
  expect(frontArticleHref({ original_link: 'http://www.sednews.com/NewsView/1HSPL12PYM', news_id: '02100311.20160316065137159' })).toBe('https://www.bigkinds.or.kr/v2/news/newsDetailView.do?newsId=02100311.20160316065137159');
  expect(frontArticleHref({ original_link: null, news_id: 'bad' })).toBeNull();
});
