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
import { RECEIPT_QR_ROWS, RECEIPT_QR_URL, cardQrUrl, qrRows } from '../data/birthdayQr';
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

/** drawShare가 쓰는 2D 문맥만 흉내 낸다 — 그린 글자(fillText)·채운 사각형(fillRect)과 aria-label을 모은다. 글자 폭은 글자 수에 비례한다고 본다. */
function fakeCanvas() {
  const texts: string[] = [];
  /** 글자를 그린 순간의 글자색(같은 글자는 마지막 것). */
  const colors: Record<string, unknown> = {};
  const rects: number[][] = [];
  const images: unknown[][] = [];
  const clips: number[] = [];
  const scales: number[][] = [];
  const attrs: Record<string, string> = {};
  const context = new Proxy({} as Record<string | symbol, unknown>, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (prop === 'measureText') return (value: string) => ({ width: value.length * 20 });
      if (prop === 'fillText') return (value: string) => { texts.push(value); colors[value] = target.fillStyle; };
      if (prop === 'fillRect') return (...box: number[]) => { rects.push(box); };
      if (prop === 'drawImage') return (...args: unknown[]) => { images.push(args); };
      if (prop === 'clip') return () => { clips.push(1); };
      if (prop === 'scale') return (...factors: number[]) => { scales.push(factors); };
      return () => undefined;
    },
    set(target, prop, value) { target[prop] = value; return true; },
  });
  const canvas = { width: 0, height: 0, getContext: () => context, setAttribute: (name: string, value: string) => { attrs[name] = value; } };
  return { canvas: canvas as unknown as HTMLCanvasElement, texts, colors, rects, images, clips, scales, attrs };
}
/** QR 칸으로 그린 사각형 — 다른 사각형(바탕·지면·줄)은 한 변이 6px보다 훨씬 크다. 카드 위 QR 한 칸은 4~5px다. */
const qrCells = (rects: number[][]) => rects.filter(([, , width, height]) => width <= 6 && height <= 6);
const darkCount = (rows: readonly string[]) => rows.join('').split('1').length - 1;
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
  expect(card.texts).toEqual(expect.arrayContaining(['5월 15일, 내가 태어난 날', '서울경제는', '1990년 5월 15일 화요일', '출처 빅카인즈 보관본', '그날 서울경제 더 보기']));
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

test('그날 신문 카드는 카드에 찍힌 날짜의 도착 페이지 QR을, 영수증은 결과 페이지 QR을 그린다', () => {
  const result = calculate('1990-05-15', snapshot);
  const front = draw({ variant: 'front' }, result);
  const receipt = draw({ variant: 'receipt' }, result);
  // 검은 칸의 개수로 어느 무늬를 그렸는지 가린다. 두 무늬의 검은 칸 수가 같으면 이 시험이 아무것도 가리지 못하므로 먼저 다름을 확인한다.
  const cardRows = qrRows(cardQrUrl('1990-05-15'));
  expect(darkCount(cardRows)).not.toBe(darkCount(RECEIPT_QR_ROWS));
  expect(qrCells(front.rects)).toHaveLength(darkCount(cardRows));
  expect(qrCells(receipt.rects)).toHaveLength(darkCount(RECEIPT_QR_ROWS));
});

// 사진 속 크기만 필요하므로 naturalWidth·naturalHeight만 가진 가짜 사진을 쓴다.
const photo = (width = 4416, height = 6200) => ({ naturalWidth: width, naturalHeight: height }) as unknown as HTMLImageElement;

test('그날 신문 카드에 1면 사진이 있으면 지면 위쪽을 사진 윗부분으로 채우고 글자 제호는 그리지 않는다', () => {
  const image = photo();
  const card = draw({ variant: 'front', photo: image });
  // 사진 가로는 통째로, 세로는 위에서부터 상자 비율(808:344)만큼 잘라 상자(136, 502, 808×344)에 그린다.
  expect(card.images).toEqual([[image, 0, 0, 4416, Math.round(4416 * 344 / 808), 136, 502, 808, 344]]);
  // 글자 제호(서울경제)는 사진이 대신하지만, 사진 속 날짜는 읽히지 않으므로 날짜는 맨 아래 출처 줄 오른쪽에 남는다.
  expect(card.texts).not.toContain('서울경제');
  const source = card.texts.indexOf('출처 빅카인즈 보관본');
  expect(card.texts[source + 1]).toBe('1990년 5월 15일 화요일');
  expect(card.texts.filter(text => text === '1990년 5월 15일 화요일')).toHaveLength(1);
  expect(card.texts).toEqual(expect.arrayContaining(['5월 15일, 내가 태어난 날', '서울경제는', '1990년 5월 15일 화요일', '출처 빅카인즈 보관본', '그날 서울경제 더 보기']));
});

test('그날 신문 카드의 기사 제목은 사진이 있든 없든 어두운 글자색으로 그린다 — 흰 지면 위에 흰 글자가 되지 않는다', () => {
  // 사진 모양은 제목 바로 위에서 글자색을 바꾸는 그리기(제호·겹줄)가 없어 한 번 이 문제가 있었다.
  for (const content of [{ photo: photo() }, {}]) {
    const card = draw({ variant: 'front', ...content });
    for (const title of ['첫 기사 제목', '둘째 기사 제목', '셋째 기사 제목']) {
      expect(card.texts, title).toContain(title);
      expect(card.colors[title], title).toBe('#111827');
    }
  }
});

test('1면 사진이 없거나 못 불러왔으면 지금까지처럼 글자 제호로 그린다', () => {
  for (const content of [{}, { photo: null }, { photo: photo(0, 0) }]) {
    const card = draw({ variant: 'front', ...content });
    expect(card.images).toEqual([]);
    expect(card.texts).toContain('서울경제');
  }
});

test('그날 신문 카드의 지면은 반듯한 사각형이 아니라 찢어 낸 모양이고, 사진은 아래 가장자리를 찢어 자른다', () => {
  // 지면(폭 888)을 fillRect 한 번으로 칠하지 않는다 — 찢어 낸 둘레를 따라 칠한다.
  expect(draw({ variant: 'front', photo: photo() }).rects.some(([, , width]) => width === 888)).toBe(false);
  expect(draw({ variant: 'front' }).rects.some(([, , width]) => width === 888)).toBe(false);
  // 사진은 찢어 낸 둘레로 잘라 그린다(clip 한 번). 사진이 없으면 자를 것이 없다.
  expect(draw({ variant: 'front', photo: photo() }).clips).toHaveLength(1);
  expect(draw({ variant: 'front' }).clips).toHaveLength(0);
});

test('영수증에는 번호·열 제목·합계·끝맺음 한 줄·발행 완료 도장이 들어가고, 웃음을 노린 말은 없다', () => {
  const card = draw({ variant: 'receipt' });
  expect(card.texts).toEqual(expect.arrayContaining(['내 생일 영수증  ·  NO. 19900515', '품목', '금액', '합계', '※ 태어난 날부터 오늘까지의 기록이에요', '완료']));
  // 차분한 영수증: 결제수단·환불 같은 말장난은 쓰지 않는다
  expect(card.texts.some(text => /결제수단|세월|환불|교환/.test(text))).toBe(false);
  // 맨 아래 줄 이름은 '지나온 시간'이 아니라 '합계'다. 화면 낭독용 설명은 그대로 '지나온 시간'이라고 읽는다.
  expect(card.texts).not.toContain('지나온 시간');
  expect(card.attrs['aria-label']).toContain('지나온 시간');
  // '발행'은 위쪽 줄 이름 하나와 도장 글자 하나
  expect(card.texts.filter(text => text === '발행')).toHaveLength(2);
  // 도장은 서비스 강조색(파랑)으로 그린다
  expect(card.colors['완료']).toBe('#1d4ed8');
});

test('날짜를 가린 영수증과 연도 공유 영수증에는 생일이 드러나는 영수증 번호가 없다', () => {
  const hidden = draw({ variant: 'receipt', includeDay: false });
  const year = draw({ variant: 'receipt', mode: 'year', includeDay: false }, calculate('1990-01-01', snapshot, 'year'));
  for (const card of [hidden, year]) {
    expect(card.texts).toContain('내 생일 영수증');
    expect(card.texts.some(text => text.includes('NO.') || /19900[15]\d{2}/.test(text))).toBe(false);
    // 소품은 그대로 있다
    expect(card.texts).toEqual(expect.arrayContaining(['품목', '합계', '완료']));
  }
});

test('영수증 끝맺음 줄은 연도만 공유된 영수증에서는 해 단위로 말한다', () => {
  const year = draw({ variant: 'receipt', mode: 'year', includeDay: false }, calculate('1990-01-01', snapshot, 'year'));
  expect(year.texts).toContain('※ 태어난 해부터 올해까지의 기록이에요');
  expect(year.texts).not.toContain('※ 태어난 날부터 오늘까지의 기록이에요');
  // 날짜를 가렸어도 개인 영수증은 '태어난 날' 기준 합계다
  expect(draw({ variant: 'receipt', includeDay: false }).texts).toContain('※ 태어난 날부터 오늘까지의 기록이에요');
});

test('영수증이 카드 높이에 안 들어가면 전체를 같은 비율로 줄이고, 들어가면 줄이지 않는다', () => {
  // 가장 긴 경우: 본문 4줄 + 100만 원 4줄 + 그날 서울경제 제목 2줄
  const longTitle = '아주 긴 기사 제목이 두 줄로 나뉘어서 영수증 안에서 가장 많은 자리를 차지하는 경우를 만든다 그래서 줄이 둘이다';
  const cells = assetCells(base2010, { ...file2010, gold: [['2010-05', 70]] }, { ...latest, gold: ['2026-09', 280] });
  const full = draw({ variant: 'receipt', front: [{ ...headlines[0], title: longTitle }], assets: cells, assetBase: base2010 }, calculate('1996-06-01', snapshot));
  expect(full.scales).toHaveLength(1);
  const [scale] = full.scales[0];
  expect(scale).toBeLessThan(1);
  // 너무 작아지면 글자가 읽히지 않는다
  expect(scale).toBeGreaterThanOrEqual(0.85);
  expect(full.scales[0][1]).toBe(scale);
  // 줄이 적은 영수증은 줄이지 않는다
  const short = draw({ variant: 'receipt', front: [], assets: [], assetBase: null, includeDay: false }, calculate('1940-01-01', snapshot));
  expect(short.scales).toEqual([[1, 1]]);
});

test('영수증은 사진을 넘겨도 쓰지 않는다', () => {
  expect(draw({ variant: 'receipt', photo: photo() }).images).toEqual([]);
});

test('그날 신문 카드의 QR은 날짜마다 다르다', () => {
  const first = draw({ variant: 'front' }, calculate('1990-05-15', snapshot));
  const second = draw({ variant: 'front' }, calculate('1990-05-16', snapshot));
  expect(qrCells(first.rects).map(box => box.join(','))).not.toEqual(qrCells(second.rects).map(box => box.join(',')));
});

test('합계(지나온 시간)는 연도 공유면 연 단위로 쓴다', () => {
  expect(receiptElapsed(calculate('1996-06-01', snapshot), 'personal', '2026-10-20')).toBe('30년 4개월');
  expect(receiptElapsed(calculate('1996-01-01', snapshot, 'year'), 'year', '2026-10-20')).toBe('약 30년');
});
