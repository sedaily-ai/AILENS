import { expect, test } from 'vitest';
import type { FrontPageData } from '@/shared/lib/api/timelineApi';
import { frontSourceNote, type FrontPageState } from './birthdayFrontPage';
import type { NaverRow } from './birthdayNewspaper';
import { needsOwnPhotoProbe, newspaperPhotoDate, newspaperView, type PhotoState } from './birthdayNewspaperView';

// 문구 정본: timemachine-data/261103_타임머신_신문장면_표시규칙.md 4절. nb()가 붙인 줄바꿈 없는 공백은 보통 공백으로 바꿔 비교한다.
const plain = (text: string) => text.replaceAll('\u00a0', ' ');
const article = (coverage?: number) => ({ news_id: '1', title: '제목', content: '', byline: '', category: '', original_link: null, ...(coverage ? { coverage } : {}) });
const data = (over: Partial<FrontPageData>): FrontPageData =>
  ({ date: '1995-05-17', date_kind: 'front', shown_date: '1995-05-17', kind: 'front', reason: null, basis: null, articles: [article()], ...over });
const ok = (over: Partial<FrontPageData>, naver?: NaverRow[]): FrontPageState => {
  const d = data(over);
  return { status: 'ok', date: d.date, data: d, ...(naver ? { naver } : {}) };
};
const naver: NaverRow[] = [{ rank: 1, title: '네이버 톱', url: 'https://n.news.naver.com/a' }, { rank: 2, title: '둘째', url: 'https://n.news.naver.com/b' }];
const view = (state: FrontPageState, birthDate: string, photo: PhotoState) => {
  const result = newspaperView(state, birthDate, photo);
  if (!result) throw new Error('view is null');
  return result;
};

test('사진이 있고 네이버 목록이면 1면 사진과 네이버 출처를 밝힌다', () => {
  const v = view(ok({ date: '2015-01-02', shown_date: '2015-01-02' }, naver), '2015-01-02', 'ok');
  expect(v.list).toBe('naver');
  expect(v.articles.map(a => a.title)).toEqual(['네이버 톱', '둘째']);
  expect(v.kicker).toBe('내가 태어난 날 서울경제 1면');
  expect(v.heading).toBe('그날의 서울경제 1면');
  expect(v.substitute).toBeNull();
  expect(v.empty).toBeNull();
  expect(plain(v.source)).toBe('1면 사진은 서울경제 지면 이미지예요. 1면 기사 목록은 네이버 신문보기에서 가져왔어요.');
});

test('사진이 없어도 네이버 목록은 1면 목록이다 — 사진 안내와 함께 보여 준다', () => {
  const v = view(ok({ date: '2015-01-02', shown_date: '2015-01-02' }, naver), '2015-01-02', 'missing');
  expect(v.kicker).toBe('내가 태어난 날 서울경제 1면');
  expect(v.empty).toEqual({ title: '이 날의 1면 사진을 찾지 못했어요', body: '대신 그날 서울경제 기사를 보여 드려요.' });
  expect(plain(v.source)).toBe('1면 기사 목록은 네이버 신문보기에서 가져왔어요. 실제 지면을 옮긴 것이 아니에요.');
});

test('그날 기사 시기는 사진이 떠야 1면이라고 부른다', () => {
  const day = ok({ date: '2010-05-12', shown_date: '2010-05-12', date_kind: 'day', kind: 'day', basis: 'issue', articles: [article(97), article(40)] });
  const loading = view(day, '2010-05-12', 'loading');
  expect(loading.kicker).toBe('내가 태어난 날 서울경제');
  expect(loading.heading).toBe('그날의 서울경제');
  expect(loading.empty).toBeNull();
  const missing = view(day, '2010-05-12', 'missing');
  expect(missing.kicker).toBe('내가 태어난 날 서울경제');
  expect(missing.empty?.title).toBe('이 날의 1면 사진을 찾지 못했어요');
  // 사진이 없을 때 출처 줄은 지금 문구 그대로다.
  expect(missing.source).toBe(frontSourceNote((day as Extract<FrontPageState, { status: 'ok' }>).data));
  const photo = view(day, '2010-05-12', 'ok');
  expect(photo.kicker).toBe('내가 태어난 날 서울경제 1면');
  expect(plain(photo.source)).toBe('1면 사진은 서울경제 지면 이미지예요. 기사는 빅카인즈 보관본에서 고른 그날 서울경제 기사예요. 1면 기사 목록이 아니에요. 그날 여러 언론이 가장 많이 다룬 소식을 보여 줘요.');
});

test('그날 기사 시기의 순서 기준 — 이슈 순위가 아니면 본문이 긴 순서라고 밝힌다', () => {
  const day = ok({ date: '2010-05-12', shown_date: '2010-05-12', date_kind: 'day', kind: 'day', basis: 'no_ranking' });
  expect(plain(view(day, '2010-05-12', 'ok').source)).toBe('1면 사진은 서울경제 지면 이미지예요. 기사는 빅카인즈 보관본에서 고른 그날 서울경제 기사예요. 1면 기사 목록이 아니에요. 기사는 본문이 긴 순서로, 사진 설명은 맨 뒤에 보여 줘요.');
  const filled = ok({ date: '2010-05-12', shown_date: '2010-05-12', date_kind: 'day', kind: 'day', basis: 'issue', articles: [article(97), article()] });
  expect(plain(view(filled, '2010-05-12', 'ok').source)).toContain('이슈로 고르지 못한 칸은 본문이 긴 기사로 채워요.');
});

test('빅카인즈 면 번호 시기는 1면 기사다', () => {
  const front = ok({});
  expect(view(front, '1995-05-17', 'missing').kicker).toBe('내가 태어난 날 서울경제 1면');
  expect(plain(view(front, '1995-05-17', 'ok').source)).toBe('1면 사진은 서울경제 지면 이미지예요. 기사는 빅카인즈 보관본에서 고른 1면 기사예요. 본문이 긴 순서로, 사진 설명은 맨 뒤에 보여 줘요.');
  expect(plain(view(front, '1995-05-17', 'missing').source)).toBe('기사는 빅카인즈 보관본에서 고른 1면 기사예요. 본문이 긴 순서로, 사진 설명은 맨 뒤에 보여 줘요. 실제 지면을 옮긴 것이 아니에요.');
});

test('일요일 — 월요일자를 보여 준다', () => {
  const v = view(ok({ date: '2024-10-13', shown_date: '2024-10-14', reason: 'sunday' }, naver), '2024-10-13', 'ok');
  expect(v.substitute?.title).toBe('생일에는 신문이 나오지 않았어요');
  expect(v.substitute?.lines.map(plain)).toEqual([
    '일요일이라 서울경제가 나오지 않았어요.',
    '대신 다음 날인 10월 14일 월요일자 서울경제 1면을 보여 줘요.',
  ]);
  expect(v.kicker).toBe('내 생일 무렵 서울경제 1면');
  expect(v.shown).toBe('2024-10-14');
});

test('일요일, 월요일자도 없으면 하루 전 토요일자를 보여 준다', () => {
  const v = view(ok({ date: '2024-10-13', shown_date: '2024-10-12', reason: 'sunday' }, naver), '2024-10-13', 'ok');
  expect(v.substitute?.lines.map(plain)).toEqual([
    '일요일이라 서울경제가 나오지 않았어요.',
    '월요일에도 신문이 없어서 하루 전인 10월 12일 토요일자 서울경제 1면을 보여 줘요.',
  ]);
  // 토요일자도 없어 더 거슬러 올라간 경우에는 '하루 전'이라고 하지 않는다.
  const further = view(ok({ date: '2024-10-13', shown_date: '2024-10-11', reason: 'sunday' }, naver), '2024-10-13', 'ok');
  expect(further.substitute?.lines.map(plain)[1]).toBe('월요일에도 신문이 없어서 가장 가까운 지난 신문인 10월 11일 금요일자 서울경제 1면을 보여 줘요.');
});

test('해를 넘기는 대체는 연도까지 쓴다', () => {
  const v = view(ok({ date: '2023-12-31', shown_date: '2024-01-01', reason: 'sunday' }, naver), '2023-12-31', 'ok');
  expect(v.substitute?.lines.map(plain)[1]).toBe('대신 다음 날인 2024년 1월 1일 월요일자 서울경제 1면을 보여 줘요.');
});

test('명절·보관본 결측 — 가장 가까운 지난 신문을 보여 준다', () => {
  const v = view(ok({ date: '2025-10-09', shown_date: '2025-10-03', reason: 'no_paper' }, naver), '2025-10-09', 'ok');
  expect(v.substitute?.title).toBe('그날 1면을 찾지 못했어요');
  expect(v.substitute?.lines.map(plain)).toEqual([
    '명절 등으로 쉬었거나 보관본에서 빠진 날이에요.',
    '대신 가장 가까운 지난 신문인 10월 3일 금요일자 서울경제 1면을 보여 줘요.',
  ]);
});

test('대체한 신문에 사진도 1면 기사도 없으면 "서울경제 1면" 대신 "서울경제"라고 쓴다', () => {
  const day = ok({ date: '2010-05-12', shown_date: '2010-05-10', date_kind: 'day', kind: 'day', basis: 'issue', reason: 'no_paper' });
  const loading = view(day, '2010-05-12', 'loading');
  expect(loading.substitute?.lines.map(plain)[1]).toBe('대신 가장 가까운 지난 신문인 5월 10일 월요일자 서울경제를 보여 줘요.');
  expect(view(day, '2010-05-12', 'ok').substitute?.lines.map(plain)[1]).toBe('대신 가장 가까운 지난 신문인 5월 10일 월요일자 서울경제 1면을 보여 줘요.');
});

test('오늘 신문이 아직 없으면 어제 신문을 대신 보여 주지 않는다', () => {
  const today = ok({ date: '2026-11-04', shown_date: '2026-11-03', reason: 'not_yet' });
  expect(newspaperPhotoDate(today, '2026-11-04')).toBe('2026-11-04');
  const missing = view(today, '2026-11-04', 'missing');
  expect(missing.empty).toEqual({ title: '오늘 1면은 아직 올라오지 않았어요', body: '오늘자 서울경제 1면이 올라오면 볼 수 있어요.' });
  expect(missing.articles).toEqual([]);
  expect(missing.substitute).toBeNull();
  // 오늘 사진이 이미 올라와 있으면 사진만 보여 준다(목록이 없다는 안내도 붙이지 않는다).
  const photo = view(today, '2026-11-04', 'ok');
  expect(photo.empty).toBeNull();
  expect(photo.kicker).toBe('내가 태어난 날 서울경제 1면');
});

test('목록이 없고 사진만 있는 날', () => {
  const none = ok({ date: '1998-07-15', kind: 'none', shown_date: null, reason: 'archive_missing', articles: [], date_kind: 'day' });
  expect(newspaperPhotoDate(none, '1998-07-15')).toBe('1998-07-15');
  const photo = view(none, '1998-07-15', 'ok');
  expect(photo.empty).toEqual({ title: '이 시기는 1면 기사 목록이 없어요', body: '1면 사진을 크게 보면 기사를 읽을 수 있어요.' });
  expect(photo.kicker).toBe('내가 태어난 날 서울경제 1면');
  expect(photo.source).toBe('1면 사진은 서울경제 지면 이미지예요.');
  expect(photo.articles).toEqual([]);
});

test('사진도 목록도 없는 날', () => {
  const none = ok({ date: '1998-07-15', kind: 'none', shown_date: null, reason: 'archive_missing', articles: [], date_kind: 'day' });
  const v = view(none, '1998-07-15', 'missing');
  expect(v.empty).toEqual({ title: '이 날의 1면은 보관돼 있지 않아요', body: '서울경제는 발행됐지만 1면 사진과 기사를 구하지 못했어요.' });
  expect(v.kicker).toBe('내가 태어난 날 서울경제');
  expect(v.heading).toBe('그날의 서울경제');
  expect(v.source).toBe('');
});

test('1990년 이전은 사진만 시도한다', () => {
  const state: FrontPageState = { status: 'image-only', date: '1985-03-02' };
  expect(newspaperPhotoDate(state, '1985-03-02')).toBe('1985-03-02');
  expect(view(state, '1985-03-02', 'loading').empty).toBeNull();
  const photo = view(state, '1985-03-02', 'ok');
  expect(photo.empty?.title).toBe('이 시기는 1면 기사 목록이 없어요');
  expect(photo.kicker).toBe('내가 태어난 날 서울경제 1면');
  const missing = view(state, '1985-03-02', 'missing');
  expect(missing.empty).toEqual({ title: '이 날의 1면은 보관돼 있지 않아요', body: '서울경제는 발행됐지만 1면 사진과 기사를 구하지 못했어요.' });
  expect(missing.kicker).toBe('내가 태어난 날 서울경제');
});

test('1978-01-01~1980-11-25는 보관된 지면이 없는 구간이라고 알린다', () => {
  for (const day of ['1978-01-01', '1979-05-05', '1980-11-25']) {
    const v = view({ status: 'image-only', date: day }, day, 'missing');
    expect(v.empty?.title).toBe('이 날의 1면은 보관돼 있지 않아요');
    expect(plain(v.empty?.body ?? '')).toBe('1978년 1월 1일부터 1980년 11월 25일까지는 보관된 지면이 없어요.');
  }
  expect(view({ status: 'image-only', date: '1977-12-31' }, '1977-12-31', 'missing').empty?.body).toBe('서울경제는 발행됐지만 1면 사진과 기사를 구하지 못했어요.');
});

test('사진을 시도하지 않는 상태는 기존 모양으로 그린다', () => {
  for (const state of [
    { status: 'loading', date: '2024-10-13' }, { status: 'error', date: '2024-10-13' },
    { status: 'notice', date: '1985-03-02', notice: 'before-archive' }, { status: 'notice', date: '1960-07-31', notice: 'before-founding' },
  ] as FrontPageState[]) {
    expect(newspaperView(state, state.date, 'loading')).toBeNull();
    expect(newspaperPhotoDate(state, state.date)).toBeNull();
  }
});

test("'1면'은 사진·네이버 목록·면 번호 시기 목록이 없으면 쓰지 않는다", () => {
  const states: Array<[FrontPageState, string]> = [
    [ok({ date: '2010-05-12', shown_date: '2010-05-12', date_kind: 'day', kind: 'day', basis: 'issue' }), '2010-05-12'],
    [ok({ date: '1998-07-15', kind: 'none', shown_date: null, reason: 'archive_missing', articles: [] }), '1998-07-15'],
    [{ status: 'image-only', date: '1985-03-02' }, '1985-03-02'],
  ];
  for (const [state, birthDate] of states) for (const photo of ['loading', 'missing'] as const) {
    const v = view(state, birthDate, photo);
    expect(v.kicker).not.toContain('1면');
    expect(v.heading).not.toContain('1면');
    expect(v.source).not.toContain('1면 기사');
    expect(v.source).not.toContain('1면 사진');
  }
});

// ── 서버가 신문 없음(no_paper)으로 물러났지만 생일 당일 사진이 있는 날 ──────────────────────────────────────────────
// 서버는 빅카인즈 기사 유무로 신문이 있는지 정한다. 기사가 빠진 날(토요일)은 사진이 있어도 하루 전으로 물러난다.
// 2009-07-04(토): 서버는 2009-07-03(금)을 보여 주려 했지만 그날 사진이 있다.
const stepped = () => ok({ date: '2009-07-04', shown_date: '2009-07-03', date_kind: 'day', kind: 'day', reason: 'no_paper', basis: 'no_ranking', articles: [article(), article()] });
const viewOwn = (state: FrontPageState, birthDate: string, photo: PhotoState, own: PhotoState | null) => {
  const result = newspaperView(state, birthDate, photo, own);
  if (!result) throw new Error('view is null');
  return result;
};

test('생일 사진을 먼저 확인해야 하는 경우: 서버가 no_paper로 다른 날로 물러났을 때만', () => {
  expect(needsOwnPhotoProbe(stepped(), '2009-07-04')).toBe(true);
  // 서버가 생일 그대로 답했다.
  expect(needsOwnPhotoProbe(ok({ date: '2009-07-04', shown_date: '2009-07-04', date_kind: 'day', kind: 'day' }), '2009-07-04')).toBe(false);
  // 일요일 대체는 화면이 reason을 sunday로 맞춘다 — 월요일 요청이라 해당하지 않는다.
  expect(needsOwnPhotoProbe(ok({ date: '2009-07-05', shown_date: '2009-07-04', date_kind: 'day', kind: 'day', reason: 'sunday' }), '2009-07-05')).toBe(false);
  // 오늘 신문은 어제 신문을 대신 보여 주지 않는다(별도 규칙).
  expect(needsOwnPhotoProbe(ok({ date: '2026-11-04', shown_date: '2026-11-03', reason: 'not_yet' }), '2026-11-04')).toBe(false);
  // 서버가 보관본에 없다고 한 날은 화면이 이미 생일 사진을 보여 준다.
  expect(needsOwnPhotoProbe(ok({ date: '1998-07-15', kind: 'none', shown_date: null, reason: 'archive_missing', articles: [] }), '1998-07-15')).toBe(false);
  // 찾는 중·오류·안내·1990년 이전(사진만)은 해당하지 않는다.
  expect(needsOwnPhotoProbe({ status: 'loading', date: '2009-07-04' }, '2009-07-04')).toBe(false);
  expect(needsOwnPhotoProbe({ status: 'error', date: '2009-07-04' }, '2009-07-04')).toBe(false);
  expect(needsOwnPhotoProbe({ status: 'image-only', date: '1985-03-02' }, '1985-03-02')).toBe(false);
});

test('생일 사진을 확인하는 중이거나 떴으면 생일 날짜의 사진을 보여 준다', () => {
  for (const own of ['loading', 'ok'] as const) {
    expect(newspaperPhotoDate(stepped(), '2009-07-04', own)).toBe('2009-07-04');
  }
  // 없으면 지금처럼 서버가 고른 직전 발행일.
  expect(newspaperPhotoDate(stepped(), '2009-07-04', 'missing')).toBe('2009-07-03');
  // own을 주지 않으면(해당하지 않는 날) 규칙은 그대로다.
  expect(newspaperPhotoDate(stepped(), '2009-07-04')).toBe('2009-07-03');
});

test('생일 사진이 떴으면 생일 날짜로 보여 주고 기사 목록은 비우며 새 안내를 쓴다', () => {
  const v = viewOwn(stepped(), '2009-07-04', 'ok', 'ok');
  expect(v.shown).toBe('2009-07-04');
  expect(v.ownPhotoDay).toBe(true);
  expect(v.list).toBe('none');
  expect(v.articles).toEqual([]);
  expect(v.substitute).toBeNull();
  expect(v.empty).toEqual({ title: '이 날은 기사 목록을 찾지 못했어요', body: '1면 사진을 크게 보면 기사를 읽을 수 있어요.' });
  expect(v.kicker).toBe('내가 태어난 날 서울경제 1면');
  expect(v.heading).toBe('그날의 서울경제 1면');
  expect(plain(v.source)).toBe('1면 사진은 서울경제 지면 이미지예요.');
});

test('생일 사진을 확인하는 동안에는 하루 전 신문의 안내·기사를 보여 주지 않는다', () => {
  const v = viewOwn(stepped(), '2009-07-04', 'loading', 'loading');
  expect(v.shown).toBe('2009-07-04');
  expect(v.substitute).toBeNull();
  expect(v.articles).toEqual([]);
  expect(v.empty).toBeNull();
  expect(v.kicker).toBe('내가 태어난 날 서울경제');
});

test('생일 사진이 없으면 지금처럼 직전 발행일 신문과 안내를 보여 준다', () => {
  const v = viewOwn(stepped(), '2009-07-04', 'ok', 'missing');
  expect(v.shown).toBe('2009-07-03');
  expect(v.ownPhotoDay).toBe(false);
  expect(v.articles).toHaveLength(2);
  expect(v.substitute?.title).toBe('그날 1면을 찾지 못했어요');
  expect(v.substitute?.lines.map(plain)).toEqual(['명절 등으로 쉬었거나 보관본에서 빠진 날이에요.', '대신 가장 가까운 지난 신문인 7월 3일 금요일자 서울경제 1면을 보여 줘요.']);
});

test('생일 사진이 떠도 서버가 고른 날의 네이버 목록은 붙이지 않는다', () => {
  const state = ok({ date: '2014-07-05', shown_date: '2014-07-04', date_kind: 'day', kind: 'day', reason: 'no_paper', basis: 'no_ranking' }, naver);
  const v = viewOwn(state, '2014-07-05', 'ok', 'ok');
  expect(v.list).toBe('none');
  expect(v.articles).toEqual([]);
  expect(v.ownPhotoDay).toBe(true);
});

test('해당하지 않는 날은 own을 주어도 규칙이 바뀌지 않는다', () => {
  // 서버가 생일 그대로 답한 날: own이 ok여도 서버의 답을 그대로 쓴다.
  const same = ok({ date: '2015-01-02', shown_date: '2015-01-02' }, naver);
  const v = viewOwn(same, '2015-01-02', 'ok', 'ok');
  expect(v.list).toBe('naver');
  expect(v.ownPhotoDay).toBe(false);
  // 일요일 대체도 그대로다.
  const sunday = ok({ date: '2004-02-08', shown_date: '2004-02-09', date_kind: 'day', kind: 'day', reason: 'sunday' });
  expect(newspaperPhotoDate(sunday, '2004-02-08', 'ok')).toBe('2004-02-09');
});
