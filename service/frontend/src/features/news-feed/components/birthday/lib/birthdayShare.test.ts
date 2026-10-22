import { expect, test } from 'vitest';
import raw from '../data/birthdaySnapshot.json';
import { EVENTS } from '@/shared/data/timelineEvents';
import { calculate } from './birthdayModel';
import type { AssetLatest, AssetYearFile } from '../data/birthdayAssets';
import { assetCells, type AssetBase } from './birthdayAssets';
import {
  DAY_TOGGLE_LABEL, dayToggleShown, drawShare, FRONT_CARD_SOURCE, INCLUDE_DAY_DEFAULT, receiptAssetHeading, receiptAssetLines, receiptElapsed, receiptLines,
  receiptSourceLine, shareDayNotice, shareText, type ShareContent,
} from './birthdayShare';
import { nb } from './keepTogether';
import { RECEIPT_QR_ROWS, RECEIPT_QR_URL } from '../data/birthdayQr';
import { BIRTHDAY_MARKET_PATH } from '../data/birthdayRoutes';
import { SITE_URL } from '@/shared/constants/site';

const snapshot = { ...raw, events: EVENTS };

test('생일 영수증은 확인된 숫자만 찍는다 — 최저시급·1억 원·그 순간 나이(대표 순간)·연금', () => {
  expect(receiptLines(calculate('1996-06-01', snapshot), 'personal')).toEqual([
    { label: '최저시급', detail: '1,275원 → 10,320원', value: '8.1배' },
    { label: '그때 1억 원', detail: '지금 돈으로', value: '2억 2,075만 원' },
    { label: '2002 한일 월드컵 개막 때', detail: '2002.05.31', value: '만 5세' },
    { label: '국민연금 정상 수령', detail: '만 65세부터', value: '2061.07' },
  ]);
  const year = receiptLines(calculate('1996-01-01', snapshot, 'year'), 'year');
  expect(year.find(line => line.label === '2002 한일 월드컵 개막 때')!.value).toBe('6년 뒤');
  expect(year.find(line => line.label === '국민연금 정상 수령')!.value).toBe('2061년');
  // 1940년생은 최저임금·물가·연금 규칙 자료가 없어 그때 나이만 남는다.
  expect(receiptLines(calculate('1940-01-01', snapshot), 'personal').map(line => line.label)).toEqual(['2002 한일 월드컵 개막 때']);
});

// 100만 원 칸 픽스처 — 2010-05-15 기준 연도 파일과 latest.json 모양만 흉내 낸다(실제 파일은 읽지 않는다).
const latest: AssetLatest = {
  generatedAt: '2026-10-21T13:40:20+09:00', until: '2026-10-20', sources: {},
  last: { cpi: '2026-09', deposit_rate: '2026-08', usdkrw_daily: '2026-10-20', usdkrw_monthly: '2026-09', apartment: '2026-07' },
  cpi: ['2026-09', 100], deposit: ['2026-09', 3], usdkrw: { daily: ['2026-10-20', 900], monthly: ['2026-09', 1400] }, apartment: ['2026-07', 120],
};
const file2010: AssetYearFile = {
  year: 2010, cpi: [['2010-05', 50]], deposit: [['2010-05', 2]],
  usdkrw: { daily: [['2010-05-14', 1000]], monthly: [['2010-05', 1005]] }, apartment: [['2010-05', 40]],
};
const base2010: AssetBase = { date: '2010-05-15', kind: 'twentieth' };

test('100만 원 칸은 계산된 칸만 고정 순서로 찍는다 — 준비 중 줄은 없다', () => {
  const lines = receiptAssetLines(assetCells(base2010, file2010, latest));
  expect(lines).toEqual([
    { label: '정기예금', value: '150만 원' },
    { label: '달러', value: '90만 원' },
    { label: '서울 아파트', value: '3배' },
  ]);
  // 아파트 지수가 없는 달(2006년 전)이면 그 줄만 빠진다.
  const noApartment = receiptAssetLines(assetCells(base2010, { ...file2010, apartment: [] }, latest));
  expect(noApartment.map(line => line.label)).toEqual(['정기예금', '달러']);
  expect(noApartment.some(line => line.value === '준비 중')).toBe(false);
});

test('금이 켜져도 100만 원 줄은 최대 4줄(예금·달러·아파트·금)이고 물가 줄은 없다', () => {
  const withGold: AssetLatest = { ...latest, gold: ['2026-09', 280] };
  const lines = receiptAssetLines(assetCells(base2010, { ...file2010, gold: [['2010-05', 70]] }, withGold));
  expect(lines.map(line => line.label)).toEqual(['정기예금', '달러', '서울 아파트', '금']);
  expect(lines[3].value).toBe('400만 원');
  expect(lines.some(line => line.label.includes('물가'))).toBe(false);
});

test('영수증 출처 한 줄: ECOS 제공과 찍힌 줄의 작성기관, 나머지는 외로 묶는다', () => {
  const result = calculate('1990-05-15', snapshot);
  const cells = assetCells(base2010, file2010, latest);
  const withGold = assetCells(base2010, { ...file2010, gold: [['2010-05', 70]] }, { ...latest, gold: ['2026-09', 280] });
  expect(receiptSourceLine(result, withGold, true)).toBe('출처 한국은행 ECOS(한국은행·국가데이터처·한국부동산원 작성) 외');
  expect(receiptSourceLine(result, cells, false)).toBe('출처 한국은행 ECOS(한국은행·국가데이터처·한국부동산원 작성) 외');
  // 아파트 줄이 없으면 한국부동산원도 빠진다.
  expect(receiptSourceLine(result, assetCells(base2010, { ...file2010, apartment: [] }, latest), false)).toBe('출처 한국은행 ECOS(한국은행·국가데이터처 작성) 외');
  // 1억 원 줄만 있으면 국가데이터처만, 시급·연금이 없고 그날 서울경제 제목도 없으면 '외'를 붙이지 않는다.
  expect(receiptSourceLine({ ...result, wage: null, calendar: null }, [], false)).toBe('출처 한국은행 ECOS(국가데이터처 작성)');
  // 1940년생은 그때 나이 줄뿐이라 밝힐 출처가 없다. ECOS 숫자 없이 다른 줄만 있으면 그 출처만 적는다.
  const old = calculate('1940-01-01', snapshot);
  expect(receiptSourceLine(old, [], false)).toBe('');
  expect(receiptSourceLine(old, [], true)).toBe('출처 빅카인즈');
});

test('그날 신문 카드에는 빅카인즈 보관본이라는 출처 한 줄이 들어간다(면 번호를 말하지 않는다)', () => {
  expect(FRONT_CARD_SOURCE).toBe('출처 빅카인즈 보관본');
});

/** drawShare가 쓰는 2D 문맥만 흉내 낸다 — 그린 글자(fillText)와 aria-label을 모은다. 글자 폭은 글자 수에 비례한다고 본다. */
function fakeCanvas() {
  const texts: string[] = [];
  const attrs: Record<string, string> = {};
  const context = new Proxy({} as Record<string | symbol, unknown>, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (prop === 'measureText') return (value: string) => ({ width: value.length * 20 });
      if (prop === 'fillText') return (value: string) => { texts.push(value); };
      return () => undefined;
    },
    set(target, prop, value) { target[prop] = value; return true; },
  });
  const canvas = { width: 0, height: 0, getContext: () => context, setAttribute: (name: string, value: string) => { attrs[name] = value; } };
  return { canvas: canvas as unknown as HTMLCanvasElement, texts, attrs };
}
const headlines = ['첫 기사 제목', '둘째 기사 제목', '셋째 기사 제목'].map((title, index) => ({ news_id: String(index), title, content: '', byline: '', category: '', original_link: null }));
const draw = (content: Partial<ShareContent>, result = calculate('1990-05-15', snapshot)) => {
  const fake = fakeCanvas();
  drawShare(fake.canvas, result, { variant: 'receipt', mode: 'personal', includeDay: INCLUDE_DAY_DEFAULT, front: headlines, assets: [], assetBase: null, ...content });
  return fake;
};
const FRONT_WORD = '1면';

test("'내 생일 넣기'는 기본으로 켜져 있어 영수증에 월·일과 그날 서울경제 제목이 찍힌다", () => {
  expect(INCLUDE_DAY_DEFAULT).toBe(true);
  expect(dayToggleShown('receipt', 'personal')).toBe(true);
  const on = draw({});
  expect(on.attrs['aria-label']).toContain('출생 1990.05.15 (화)');
  expect(on.attrs['aria-label']).toContain('그날 서울경제 첫 기사 제목');
  expect(on.texts).toContain('그날 서울경제');
  expect(shareDayNotice('receipt', 'personal', true)?.replaceAll('\u00a0', ' ')).toBe("생일 날짜가 이미지에 찍혀요. 빼려면 '내 생일 넣기'를 끄세요.");
  // 안내 속 이름은 체크박스 이름 그대로다.
  expect(shareDayNotice('receipt', 'personal', true)).toContain(nb(`'${DAY_TOGGLE_LABEL}'를`));
});

test("'내 생일 넣기'를 끄면 출생연도만 찍히고 버튼 위 안내도 없다", () => {
  const off = draw({ includeDay: false });
  expect(off.attrs['aria-label']).toContain('출생 1990년생');
  expect(off.attrs['aria-label']).not.toContain('그날 서울경제');
  expect(off.texts).not.toContain('그날 서울경제');
  expect(shareDayNotice('receipt', 'personal', false)).toBeNull();
});

test('연도 공유는 체크박스가 없고 날짜도 찍지 않는다', () => {
  expect(dayToggleShown('receipt', 'year')).toBe(false);
  expect(shareDayNotice('receipt', 'year', INCLUDE_DAY_DEFAULT)).toBeNull();
  // BirthdayShare는 연도 공유면 includeDay를 끈 채로 그린다(dayShown).
  const year = draw({ mode: 'year', includeDay: false, front: [] }, calculate('1990-01-01', snapshot, 'year'));
  expect(year.attrs['aria-label']).toContain('출생 1990년생');
});

test("그날 신문 카드는 날짜가 늘 들어가 '찍혀요'만 알리고, 체크박스가 없다", () => {
  expect(dayToggleShown('front', 'personal')).toBe(false);
  expect(shareDayNotice('front', 'personal', true)).toBe('생일 날짜가 이미지에 찍혀요.');
  expect(shareDayNotice('front', 'personal', false)).toBe('생일 날짜가 이미지에 찍혀요.');
});

test("공유 문구·카드 이미지 글·화면 낭독용 이름에 '1면'이 없다", () => {
  const result = calculate('1990-05-15', snapshot);
  expect(shareText(result, 'front')).toBe('내 생일날 서울경제는? 1990년 5월 15일 · 내 생일 타임머신');
  for (const variant of ['receipt', 'front'] as const) expect(shareText(result, variant)).not.toContain(FRONT_WORD);
  const card = draw({ variant: 'front' });
  expect(card.attrs['aria-label']).toBe('AI LENS 내 생일 타임머신 그날 신문 카드. 내 생일날 서울경제는? 1990년 5월 15일 · 내 생일 타임머신. 첫 기사 제목, 둘째 기사 제목, 셋째 기사 제목. 출처 빅카인즈 보관본');
  expect(card.texts).toEqual(expect.arrayContaining(['5월 15일, 내가 태어난 날', '서울경제는', '1990년 5월 15일 화요일', '출처 빅카인즈 보관본', '내 생일 신문도 찾아보기']));
  for (const fake of [card, draw({}), draw({ includeDay: false })]) {
    expect(fake.attrs['aria-label']).not.toContain(FRONT_WORD);
    expect(fake.attrs['aria-label']).not.toContain('면 번호');
    expect(fake.texts.filter(text => text.includes(FRONT_WORD) || text.includes('면 번호'))).toEqual([]);
  }
  for (const variant of ['receipt', 'front'] as const) for (const includeDay of [true, false]) {
    expect(shareDayNotice(variant, 'personal', includeDay) ?? '').not.toContain(FRONT_WORD);
  }
});

test("면 번호가 없는 시기의 그날 기사(coverage 포함, 4건)도 카드·영수증 제목으로 그리고 '1면'이 없다", () => {
  // 백엔드 FRONT_DAY_ARTICLES(4건)는 카드가 쓰는 최대 5건보다 적다.
  const day = ['이슈 첫 기사', '이슈 둘째 기사', '이슈 셋째 기사', '본문이 긴 기사'].map((title, index) => ({ ...headlines[0], news_id: `d${index}`, title, coverage: index < 3 ? 300 - index * 50 : null }));
  const result = calculate('2005-05-11', snapshot);
  const card = draw({ variant: 'front', front: day }, result);
  expect(card.texts).toEqual(expect.arrayContaining(['5월 11일, 내가 태어난 날', '서울경제는', '2005년 5월 11일 수요일', '이슈 첫 기사', '이슈 둘째 기사', '본문이 긴 기사', FRONT_CARD_SOURCE]));
  expect(card.attrs['aria-label']).toContain('이슈 첫 기사, 이슈 둘째 기사, 이슈 셋째 기사, 본문이 긴 기사. 출처 빅카인즈 보관본');
  const receipt = draw({ front: day }, result);
  expect(receipt.attrs['aria-label']).toContain('그날 서울경제 이슈 첫 기사');
  expect(receipt.texts).toEqual(expect.arrayContaining(['그날 서울경제', '이슈 첫 기사']));
  for (const fake of [card, receipt]) {
    expect(fake.attrs['aria-label']).not.toContain(FRONT_WORD);
    expect(fake.texts.filter(text => text.includes(FRONT_WORD) || text.includes('면 번호'))).toEqual([]);
  }
});

test('100만 원 묶음 소제목은 기준일 종류에 따라 바뀐다', () => {
  expect(receiptAssetHeading({ date: '2010-05-15', kind: 'twentieth' })).toBe('스무 살에 100만 원을 뒀다면');
  expect(receiptAssetHeading({ date: '2010-08-20', kind: 'birthday' })).toBe('태어난 날 100만 원을 뒀다면');
});

test('영수증 QR은 결과 페이지 주소(영수증 유입 표시 포함)를 담은 37×37 무늬다', () => {
  expect(RECEIPT_QR_URL).toBe(`${SITE_URL}${BIRTHDAY_MARKET_PATH}?utm_source=birthday_receipt`);
  expect(RECEIPT_QR_ROWS).toHaveLength(37);
  expect(RECEIPT_QR_ROWS.every(row => /^[01]{37}$/.test(row))).toBe(true);
  // 세 모서리의 위치 찾기 무늬(7×7) 윗줄
  expect(RECEIPT_QR_ROWS[0].slice(0, 7)).toBe('1111111');
  expect(RECEIPT_QR_ROWS[0].slice(-7)).toBe('1111111');
  expect(RECEIPT_QR_ROWS[36].slice(0, 7)).toBe('1111111');
});

test('합계(지나온 시간)는 연도 공유면 연 단위로 쓴다', () => {
  expect(receiptElapsed(calculate('1996-06-01', snapshot), 'personal', '2026-10-20')).toBe('30년 4개월');
  expect(receiptElapsed(calculate('1996-01-01', snapshot, 'year'), 'year', '2026-10-20')).toBe('약 30년');
});
