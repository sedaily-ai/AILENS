import { expect, test } from 'vitest';
import type { FrontPageData } from '@/shared/lib/api/timelineApi';
import { ARRIVAL_COPY, arrivalMissing, arrivalTitle, guestKicker, parseArrivalDate } from './birthdayArrival';
import { arrivalShowsPaper, type FrontPageState } from './birthdayFrontPage';

const TODAY = '2026-11-04';

test('주소의 날짜는 실제 있는 날짜이고 1900-01-01부터 오늘까지일 때만 쓴다', () => {
  expect(parseArrivalDate('1996-06-01', TODAY)).toBe('1996-06-01');
  expect(parseArrivalDate('1900-01-01', TODAY)).toBe('1900-01-01');
  expect(parseArrivalDate(TODAY, TODAY)).toBe(TODAY);
  expect(parseArrivalDate('2024-02-29', TODAY)).toBe('2024-02-29');
  // 없는 날짜·범위 밖·형식이 다른 값은 404
  for (const bad of ['2026-02-30', '2025-02-29', '1899-12-31', '2026-11-05', '2999-01-01', '2026-13-01', '2026-00-10', '2026-1-5', '20261104', 'abc', '']) {
    expect(parseArrivalDate(bad, TODAY), bad).toBeNull();
  }
});

test('탭 제목은 날짜를 한글로 쓴다', () => {
  expect(arrivalTitle('1996-06-01')).toBe('1996년 6월 1일 서울경제 — 내 생일 타임머신');
});

test('장면 이름은 생일 주인이 아닌 사람에게 맞게 바꾼다', () => {
  expect(guestKicker('내가 태어난 날 서울경제')).toBe('그날 서울경제');
  expect(guestKicker('내가 태어난 날 서울경제 1면')).toBe('그날 서울경제 1면');
  expect(guestKicker('내 생일 무렵 서울경제')).toBe('그 무렵 서울경제');
  expect(guestKicker('내가 태어난 날 신문')).toBe('그날 신문');
  expect(guestKicker('그날 신문')).toBe('그날 신문');
  // 도착 페이지가 스스로 쓰는 이름은 이미 '그날'이다
  expect(ARRIVAL_COPY.kicker).toBe('그날 서울경제');
});

const article = { news_id: '1', title: '기사', content: '', byline: '', category: '', original_link: null };
const data = (over: Partial<FrontPageData>): FrontPageData => ({
  date: '1996-06-01', date_kind: 'front', shown_date: '1996-06-01', kind: 'front', reason: null, basis: null, articles: [article], ...over,
});
const ok = (over: Partial<FrontPageData>): FrontPageState => ({ status: 'ok', date: '1996-06-01', data: data(over) });

test('그날 신문 장면은 그 날짜의 기사가 있거나 아직 알 수 없을 때만 보여 준다', () => {
  expect(arrivalShowsPaper(null)).toBe(false);
  // 알 수 없는 상태는 장면이 알아서 그린다
  expect(arrivalShowsPaper({ status: 'loading', date: '1996-06-01' })).toBe(true);
  expect(arrivalShowsPaper({ status: 'error', date: '1996-06-01' })).toBe(true);
  expect(arrivalShowsPaper({ status: 'notice', date: '1960-01-01', notice: 'before-founding' })).toBe(true);
  expect(arrivalShowsPaper({ status: 'image-only', date: '1975-01-02' })).toBe(true);
  // 서버가 답했을 때: 그 날짜의 기사(면 번호가 있든 없든)
  expect(arrivalShowsPaper(ok({}))).toBe(true);
  expect(arrivalShowsPaper(ok({ kind: 'day', date_kind: 'day', basis: 'issue' }))).toBe(true);
  // 다른 날을 대신 골랐거나 아무것도 없거나 기사가 비면 도착 페이지의 안내
  expect(arrivalShowsPaper(ok({ shown_date: '1996-05-31', reason: 'no_paper' }))).toBe(false);
  expect(arrivalShowsPaper(ok({ kind: 'none', shown_date: null, reason: 'archive_missing', articles: [] }))).toBe(false);
  expect(arrivalShowsPaper(ok({ articles: [] }))).toBe(false);
});

test('기사를 못 찾은 날의 안내는 이유(알 때)와 다음에 할 일을 부드럽게 말하고, 없다는 말로 끝나지 않는다', () => {
  const next = '아래에서 내 생일의 신문을 찾아볼 수 있어요.';
  // nb()가 붙인 줄바꿈 없는 공백(U+00A0)은 보통 공백으로 바꿔 문장만 비교한다.
  const body = (state: FrontPageState | null) => arrivalMissing(state).body.replaceAll('\u00a0', ' ');
  const sunday = arrivalMissing(ok({ shown_date: '1996-05-31', reason: 'sunday' }));
  expect(sunday.title).toBe('이 날의 신문은 보여 드리지 못했어요');
  expect(body(ok({ shown_date: '1996-05-31', reason: 'sunday' }))).toBe(`일요일에는 서울경제가 나오지 않았어요. ${next}`);
  expect(body(ok({ shown_date: '1996-05-31', reason: 'not_yet' }))).toBe(`오늘 신문은 아직 보관본에 들어오지 않았어요. ${next}`);
  // 까닭을 모르거나 단정할 수 없으면 '일 수 있어요'로 말한다
  for (const state of [ok({ reason: 'no_paper', shown_date: '1996-05-31' }), ok({ kind: 'none', reason: 'archive_missing', shown_date: null, articles: [] }), null]) {
    expect(body(state)).toBe(`명절 등으로 쉬었거나 보관본에서 빠진 날일 수 있어요. ${next}`);
  }
  // 375px에서 '수 있어요.'만 마지막 줄에 남지 않게 뒷 문장은 덩어리로 묶여 있다.
  expect(sunday.body).toContain('찾아볼\u00a0수\u00a0있어요.');
  expect(sunday.body).toContain('아래에서\u00a0내\u00a0생일의\u00a0신문을');
  expect(ARRIVAL_COPY.action).toBe('내 생일 신문도 찾아보기');
});
