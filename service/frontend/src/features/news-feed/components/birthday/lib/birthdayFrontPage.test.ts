import { expect, test } from 'vitest';
import { frontArticleHref, frontPageNotice, previousDay } from './birthdayFrontPage';

test('서버에 묻지 않고 안내하는 날짜 — 창간 전·지면 공백·보관 전·면 번호 없음·일요일 휴간', () => {
  expect(frontPageNotice('1960-07-31')).toBe('before-founding');
  expect(frontPageNotice('1988-02-03')).toBe('suspended');
  expect(frontPageNotice('1988-08-01')).toBe('before-archive');
  expect(frontPageNotice('1993-12-31')).toBe('no-page-info');
  expect(frontPageNotice('2002-06-22')).toBe('no-page-info');
  expect(frontPageNotice('2017-11-11')).toBe('no-page-info');
  expect(frontPageNotice('2000-03-19')).toBe('sunday');
  expect(frontPageNotice('2024-12-08')).toBe('sunday');
});

test('면 번호가 있는 기간은 조회한다 — 1996년 9월 전 일요일 포함', () => {
  for (const date of ['1994-01-01', '1996-06-01', '1996-06-02', '1996-07-31', '2017-11-13', '2024-12-04']) expect(frontPageNotice(date)).toBeNull();
  expect(frontPageNotice('1996-08-01')).toBe('no-page-info');
});

test('하루 전 날짜와 기사 링크 규칙', () => {
  expect(previousDay('2000-03-01')).toBe('2000-02-29');
  expect(previousDay('2025-01-01')).toBe('2024-12-31');
  expect(frontArticleHref({ original_link: 'https://www.sedaily.com/NewsView/1', news_id: '02100311.1' })).toBe('https://www.sedaily.com/NewsView/1');
  expect(frontArticleHref({ original_link: 'http://www.sednews.com/NewsView/1HSPL12PYM', news_id: '02100311.20160316065137159' })).toBe('https://www.bigkinds.or.kr/v2/news/newsDetailView.do?newsId=02100311.20160316065137159');
  expect(frontArticleHref({ original_link: null, news_id: 'bad' })).toBeNull();
});
