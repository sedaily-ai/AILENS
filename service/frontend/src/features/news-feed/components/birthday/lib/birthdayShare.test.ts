import { expect, test } from 'vitest';
import raw from '../data/birthdaySnapshot.json';
import { EVENTS } from '@/shared/data/timelineEvents';
import { calculate } from './birthdayModel';
import type { AssetLatest, AssetYearFile } from '../data/birthdayAssets';
import { assetCells, type AssetBase } from './birthdayAssets';
import { receiptAssetHeading, receiptAssetLines, receiptElapsed, receiptLines, receiptSourceLine } from './birthdayShare';
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
  const withGold: AssetLatest = { ...latest, gold: { usd: ['2026-09', 4000], usdkrw: ['2026-09', 1400] } };
  const lines = receiptAssetLines(assetCells(base2010, { ...file2010, gold: [['2010-05', 1200]] }, withGold));
  expect(lines.map(line => line.label)).toEqual(['정기예금', '달러', '서울 아파트', '금 한 돈']);
  expect(lines.some(line => line.label.includes('물가'))).toBe(false);
});

test('영수증 출처 한 줄: ECOS 외로 묶고, 금 줄이 있으면 세계은행 Pink Sheet(CC BY 4.0)', () => {
  const result = calculate('1990-05-15', snapshot);
  const cells = assetCells(base2010, file2010, latest);
  const withGold = assetCells(base2010, { ...file2010, gold: [['2010-05', 1200]] }, { ...latest, gold: { usd: ['2026-09', 4000], usdkrw: ['2026-09', 1400] } });
  expect(receiptSourceLine(result, withGold, true)).toBe('출처 한국은행 ECOS 외 · 세계은행 Pink Sheet(CC BY 4.0)');
  expect(receiptSourceLine(result, cells, false)).toBe('출처 한국은행 ECOS 외');
  // 1억 원 줄만 있어도 ECOS, 시급·연금이 없고 1면 제목도 없으면 '외'를 붙이지 않는다.
  expect(receiptSourceLine({ ...result, wage: null, calendar: null }, [], false)).toBe('출처 한국은행 ECOS');
  // 1940년생은 그때 나이 줄뿐이라 밝힐 출처가 없다. ECOS 숫자 없이 다른 줄만 있으면 그 출처만 적는다.
  const old = calculate('1940-01-01', snapshot);
  expect(receiptSourceLine(old, [], false)).toBe('');
  expect(receiptSourceLine(old, [], true)).toBe('출처 빅카인즈');
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
